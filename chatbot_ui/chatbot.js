// chatbot_ui/chatbot.js

// GoogleGenerativeAI import 경로 수정
import { GoogleGenerativeAI } from '../lib/google-generative-ai.esm.js';

const settingsBtn = document.getElementById('settings-btn');
const apiKeySection = document.getElementById('api-key-section');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiKeyMsg = document.getElementById('apiKeyMsg');

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const loader = document.getElementById('loader');
const closeChatbotBtn = document.getElementById('close-chatbot-btn');

const fullscreenBtn = document.getElementById('fullscreen-btn');
const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');
const chatbotContainer = document.getElementById('chatbot-container');

const themeToggleBtn = document.getElementById('theme-toggle-btn');

const summarizePageBtn = document.getElementById('summarizePageBtn');
const translatePageBtn = document.getElementById('translatePageBtn');
const translateSelectionBtn = document.getElementById('translateSelectionBtn');

const imageUploadBtn = document.getElementById('image-upload-btn');
const imageFileInput = document.getElementById('image-file-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image');

let currentApiKey = null;
let attachedImage = null;

// Gemini AI SDK 관련 변수
let genAI = null;
let chatSession = null;

// marked.js 옵션 설정
marked.setOptions({
  gfm: true,
  breaks: true,
});

document.addEventListener('DOMContentLoaded', initializeChatbot);

function initializeChatbot() {
  chrome.storage.local.get(['geminiApiKey', 'theme'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
      currentApiKey = result.geminiApiKey;
      initializeGenAI(); // API 키 로드 후 GenAI 초기화
      startNewChatSession(); // API 키 있으면 새 세션 시작 시도
    }

    if (result.theme === 'dark') {
      document.documentElement.classList.add('dark-mode');
      themeToggleBtn.textContent = 'light_mode';
    } else {
      document.documentElement.classList.remove('dark-mode');
      themeToggleBtn.textContent = 'dark_mode';
    }
  });

  fullscreenBtn.addEventListener('click', toggleFullscreen);
  fullscreenExitBtn.addEventListener('click', toggleFullscreen);
  settingsBtn.addEventListener('click', toggleApiKeySection);
  saveApiKeyBtn.addEventListener('click', saveApiKey);
  closeChatbotBtn.addEventListener('click', closeChatbot);
  themeToggleBtn.addEventListener('click', toggleTheme);

  summarizePageBtn.addEventListener('click', handleSummarizePage);
  translatePageBtn.addEventListener('click', handleTranslatePage);
  translateSelectionBtn.addEventListener('click', handleTranslateSelectedText);

  imageUploadBtn.addEventListener('click', () => imageFileInput.click());
  imageFileInput.addEventListener('change', handleImageUpload);
  removeImageBtn.addEventListener('click', removeAttachedImage);
  userInput.addEventListener('paste', handlePasteImage);

  sendBtn.addEventListener('click', () => {
    sendMessage();
  });

  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  userInput.addEventListener('input', adjustTextareaHeight);

  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
  document.addEventListener('mozfullscreenchange', updateFullscreenUI);
  document.addEventListener('MSFullscreenChange', updateFullscreenUI);

  // content.js (부모 프레임) 로부터 오는 메시지 처리
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !event.data) {
      return;
    }
    const request = event.data;
    if (request.type === "TRANSLATE_SELECTION_FROM_HOVER") {
      loader.classList.remove('hidden');
      if (request.selectedText) {
        const snippet = request.selectedText.length > 50 ? request.selectedText.substring(0, 50) + "..." : request.selectedText;
        addMessageToUI(`[페이지 선택] "${snippet}" 번역 요청됨`, true);
        handleTranslateSelectedText(request.selectedText); // 선택된 텍스트 직접 전달
      } else {
        addMessageToUI("호버 버튼에서 전달된 텍스트가 없습니다.", false, true);
        loader.classList.add('hidden');
      }
    }
  });

  // background.js 로부터 오는 스트리밍 응답 처리는 ChatSession을 사용하면서 불필요해짐.
  // chrome.runtime.onMessage 리스너에서 GEMINI_STREAMING_RESPONSE 처리 부분은 삭제 또는 주석 처리.
  // (단, 다른 타입의 메시지를 백그라운드에서 받는다면 해당 리스너는 유지)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 이 리스너는 챗봇 내부의 Gemini API 직접 호출로 인해 GEMINI_STREAMING_RESPONSE 처리가 불필요.
    // 다른 메시지 타입(예: 팝업과의 통신)이 있다면 그 부분은 유지.
    // 현재 파일 구조상으로는 TRANSLATE_SELECTION_REQUEST_FROM_HOVER 외에는 특별히 background에서 직접 chatbot.js로 보낼 메시지가 없어보임.
    // 해당 타입도 content.js를 통해 postMessage로 전달되는 것이 일반적임.
    if (request.type === "TRANSLATE_SELECTION_REQUEST_FROM_HOVER") {
      // 이 메시지는 content.js에서 chatbot.html로 postMessage를 통해 전달되는 것이 더 적합.
      // 현재 코드에서는 window.addEventListener("message", ...) 에서 처리 중.
    }
    return true;
  });
}

function initializeGenAI() {
  if (currentApiKey) {
    try {
      genAI = new GoogleGenerativeAI(currentApiKey);
    } catch (error) {
      console.error("Error initializing GoogleGenerativeAI:", error);
      apiKeyMsg.textContent = 'API 키 초기화 중 오류 발생. 키를 확인해주세요.';
      apiKeyMsg.style.color = '#ef4444';
      currentApiKey = null; // 키가 유효하지 않음을 표시
      genAI = null;
    }
  } else {
    genAI = null;
  }
}

function startNewChatSession(history = []) {
  if (!currentApiKey) {
    addMessageToUI("API 키가 설정되지 않았습니다. 설정에서 API 키를 먼저 저장해주세요.", false, true);
    apiKeySection.classList.remove('hidden');
    return false;
  }
  if (!genAI) {
    initializeGenAI();
    if (!genAI) { // 초기화 실패 시
      addMessageToUI("Gemini AI 초기화 실패. API 키를 확인해주세요.", false, true);
      return false;
    }
  }

  try {
    // TODO: 사용자가 설정할 수 있는 model, safetySettings, generationConfig 등을 chatbotGlobalParams 등에서 가져오도록 확장 가능
    const modelInstance = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    chatSession = modelInstance.startChat({
      history: history,
      // generationConfig: { temperature: 0.7, ... }, // 필요시 설정
      // safetySettings: [ ... ], // 필요시 설정
    });
    console.log("새로운 ChatSession이 시작되었습니다.");
    // 새 대화 시작 시 기존 메시지 클리어 (선택적)
    // clearChatMessages();
    // addMessageToUI("새 대화가 시작되었습니다. 무엇을 도와드릴까요?", false);
    return true;
  } catch (error) {
    console.error("ChatSession 시작 중 오류:", error);
    addMessageToUI(`ChatSession 시작 오류: ${error.message}`, false, true);
    return false;
  }
}

function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    apiKeyMsg.textContent = 'API 키를 입력해주세요.';
    apiKeyMsg.style.color = '#ef4444';
    return;
  }

  currentApiKey = apiKey;
  chrome.storage.local.set({ 'geminiApiKey': apiKey }, () => {
    apiKeyMsg.textContent = 'API 키가 성공적으로 저장되었습니다.';
    apiKeyMsg.style.color = '#10b981';
    initializeGenAI(); // 새 키로 GenAI 재초기화
    if (startNewChatSession()) { // 새 키로 새 세션 시작
      setTimeout(() => {
        apiKeySection.classList.add('hidden');
        // addMessageToUI('API 키가 설정되었습니다. 이제 질문하실 수 있습니다.', false); // startNewChatSession 성공 메시지로 대체 가능
      }, 1500);
    }
  });
}

function addMessageToUI(text, isUser = false, isError = false, imageUrl = null) {
  const messageDiv = document.createElement("div");
  messageDiv.className = isUser ? "message user-message" : "message bot-message";

  const avatarDiv = document.createElement("div");
  avatarDiv.className = "message-avatar";
  const avatarIcon = document.createElement("span");
  avatarIcon.className = "material-symbols-rounded";
  avatarIcon.textContent = isUser ? "person" : "smart_toy";
  avatarDiv.appendChild(avatarIcon);

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (isError) {
    messageDiv.classList.add("error");
  }

  if (imageUrl) {
    const imageElement = document.createElement("img");
    imageElement.src = imageUrl;
    imageElement.className = "message-image"; // 사용자 메시지 내 이미지 스타일
    imageElement.alt = isUser ? "첨부 이미지" : "생성된 이미지";
    contentDiv.appendChild(imageElement);
  }

  const paragraph = document.createElement("p");
  if (isUser || isError) { // 사용자 메시지 또는 에러 메시지는 텍스트 직접 표시
    paragraph.textContent = text;
  } else { // 봇 메시지는 마크다운 처리
    try {
      paragraph.innerHTML = marked.parse(text);
    } catch (e) {
      console.error("Markdown 파싱 오류:", e);
      paragraph.textContent = text; // 파싱 실패 시 일반 텍스트로
    }
  }
  contentDiv.appendChild(paragraph);

  messageDiv.appendChild(avatarDiv);
  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);

  chatMessages.scrollTop = chatMessages.scrollHeight;
  return messageDiv; // 스트리밍 업데이트를 위해 div 반환
}


async function getPageContentForChat() {
  return new Promise((resolve, reject) => {
    const requestId = `page_content_req_${Date.now()}`;
    const listener = (event) => {
      if (event.source === window.parent && event.data && event.data.requestId === requestId) {
        window.removeEventListener("message", listener);
        if (event.data.type === "PAGE_CONTENT_RESULT") {
          resolve(event.data.content);
        } else {
          reject(new Error(event.data.error || "페이지 내용을 가져오지 못했습니다."));
        }
      }
    };
    window.addEventListener("message", listener);
    window.parent.postMessage({ type: "GET_PAGE_CONTENT", requestId: requestId }, "*");
    setTimeout(() => { // Timeout
      window.removeEventListener("message", listener);
      reject(new Error("페이지 내용 요청 시간 초과"));
    }, 10000);
  });
}

async function getSelectedTextFromPage() {
  return new Promise((resolve, reject) => {
    const requestId = `selected_text_req_${Date.now()}`;
    const listener = (event) => {
      if (event.source === window.parent && event.data && event.data.requestId === requestId) {
        window.removeEventListener("message", listener);
        if (event.data.type === "SELECTED_TEXT_RESULT") {
          resolve(event.data.selectedText);
        } else {
          resolve(""); // 오류 발생 시 빈 문자열 반환 또는 reject
        }
      }
    };
    window.addEventListener("message", listener);
    window.parent.postMessage({ type: "GET_SELECTED_TEXT", requestId: requestId }, "*");
    setTimeout(() => { // Timeout
      window.removeEventListener("message", listener);
      reject(new Error("선택된 텍스트 요청 시간 초과"));
    }, 5000);
  });
}

async function handleSummarizePage() {
  if (!chatSession && !startNewChatSession()) return;
  addMessageToUI("페이지 내용 요약을 요청합니다...", true);
  loader.classList.remove('hidden');
  try {
    const pageContent = await getPageContentForChat();
    if (!pageContent || pageContent.trim().length === 0) {
      addMessageToUI("현재 페이지의 내용을 가져올 수 없거나 내용이 없습니다.", false, true);
      loader.classList.add('hidden');
      return;
    }
    const prompt = `다음 텍스트를 한국어로 핵심 내용을 중심으로 간결하게 요약해줘:\n\n${pageContent}`;
    await streamResponse(prompt);
  } catch (error) {
    addMessageToUI("페이지 요약 중 오류: " + error.message, false, true);
    loader.classList.add('hidden');
  }
}

async function handleTranslatePage() {
  if (!chatSession && !startNewChatSession()) return;
  addMessageToUI("페이지 전체 번역(영어를 한국어로)을 요청합니다...", true);
  loader.classList.remove('hidden');
  try {
    const pageContent = await getPageContentForChat();
    if (!pageContent || pageContent.trim().length === 0) {
      addMessageToUI("현재 페이지의 내용을 가져올 수 없거나 내용이 없습니다.", false, true);
      loader.classList.add('hidden');
      return;
    }
    const targetLanguage = "한국어";
    const prompt = `다음 텍스트는 영어로 작성된 내용이야. 이 내용을 ${targetLanguage}(으)로 자연스럽게 번역해줘. HTML 태그나 코드는 번역 결과에 포함하지 마.:\n\n${pageContent}`;
    await streamResponse(prompt);
  } catch (error) {
    addMessageToUI("페이지 번역 중 오류: " + error.message, false, true);
    loader.classList.add('hidden');
  }
}

async function handleTranslateSelectedText(textToTranslate = null) {
  if (!chatSession && !startNewChatSession()) return;

  loader.classList.remove('hidden');
  try {
    const selectedText = textToTranslate || await getSelectedTextFromPage();

    if (!selectedText || selectedText.trim().length === 0) {
      addMessageToUI("번역할 텍스트가 선택되지 않았습니다.", false, true);
      loader.classList.add('hidden');
      return;
    }
    // 사용자 요청 메시지는 이미 addMessageToUI로 추가되었거나, 직접 입력 시 sendMessage에서 추가됨
    // addMessageToUI(`선택한 텍스트 ("${selectedText.substring(0,30)}...") 번역을 요청합니다...`, true);

    const targetLanguage = "한국어";
    const prompt = `다음 텍스트를 ${targetLanguage}(으)로 번역해줘:\n\n"${selectedText}"`;
    await streamResponse(prompt);
  } catch (error) {
    addMessageToUI("선택 영역 번역 중 오류: " + error.message, false, true);
    loader.classList.add('hidden');
  }
}

async function streamResponse(promptText, imageParts = null) {
  if (!chatSession && !startNewChatSession()) {
    loader.classList.add('hidden');
    return;
  }

  const botMessageDiv = addMessageToUI("답변 생성 중...", false);
  const paragraph = botMessageDiv.querySelector('.message-content p');
  if (paragraph) paragraph.innerHTML = ""; // "답변 생성 중..." 텍스트 제거

  try {
    const contentRequest = [];
    if (promptText) {
      contentRequest.push({ text: promptText });
    }
    if (imageParts) { // imageParts는 이미 {inlineData: {data: ..., mimeType: ...}} 형식이어야 함
      contentRequest.push(imageParts);
    }

    if (contentRequest.length === 0) {
      if (paragraph) paragraph.innerHTML = "요청 내용이 없습니다.";
      loader.classList.add('hidden');
      return;
    }

    const result = await chatSession.sendMessageStream(contentRequest);
    let accumulatedText = "";

    for await (const chunk of result.stream) {
      if (chunk.candidates && chunk.candidates.length > 0) {
        const chunkText = chunk.text(); // Gemini SDK 0.24.1 에서는 chunk.text() 사용
        accumulatedText += chunkText;
        if (paragraph) {
          try {
            paragraph.innerHTML = marked.parse(accumulatedText);
          } catch (e) {
            console.error("Markdown 파싱 중 오류:", e);
            paragraph.textContent = accumulatedText; // 파싱 실패 시 일반 텍스트
          }
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
    // 히스토리는 ChatSession에 의해 자동으로 업데이트됨
  } catch (error) {
    console.error("Gemini API 스트리밍 오류 (ChatSession):", error);
    if (paragraph) {
      paragraph.innerHTML = `<span class="error-message">API 오류: ${error.message || '알 수 없는 오류'}</span>`;
    } else {
      // 만약 botMessageDiv가 어떤 이유로든 생성되지 않았다면 (거의 발생하지 않음)
      addMessageToUI(`API 오류: ${error.message || '알 수 없는 오류'}`, false, true);
    }
  } finally {
    loader.classList.add('hidden');
  }
}


function sendMessage() {
  const text = userInput.value.trim();
  if (!text && !attachedImage) return;

  if (!chatSession && !startNewChatSession()) return; // 세션 시작 또는 API 키 확인

  // 사용자 메시지 UI에 추가
  if (text || attachedImage) {
    addMessageToUI(text, true, false, attachedImage ? attachedImage.data : null);
  }

  userInput.value = "";
  userInput.style.height = 'auto'; // 입력창 높이 초기화

  let imageContentPart = null;
  if (attachedImage) {
    let base64Image = attachedImage.data;
    if (base64Image.startsWith('data:image')) {
      base64Image = base64Image.split(',')[1];
    }
    imageContentPart = {
      inlineData: {
        data: base64Image,
        mimeType: attachedImage.type || "image/jpeg"
      }
    };
  }

  removeAttachedImage(); // UI에서 이미지 프리뷰 제거 및 attachedImage 변수 초기화
  loader.classList.remove('hidden');

  // streamResponse 함수에 텍스트와 이미지 파트 전달
  streamResponse(text || (imageContentPart ? "이 이미지에 대해 설명해주세요." : ""), imageContentPart);
}


// --- 이미지 관련 함수들 (기존과 거의 동일) ---
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    addMessageToUI("이미지 파일만 첨부할 수 있습니다.", false, true);
    return;
  }
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    addMessageToUI("이미지 크기가 너무 큽니다 (최대 5MB).", false, true);
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    imagePreview.src = e.target.result;
    imagePreviewContainer.classList.remove('hidden');
    attachedImage = {
      data: e.target.result,
      name: file.name,
      type: file.type
    };
  };
  reader.onerror = function () {
    addMessageToUI("이미지 파일을 읽는 중 오류가 발생했습니다.", false, true);
  };
  reader.readAsDataURL(file);
}

function removeAttachedImage() {
  attachedImage = null;
  imagePreview.src = '';
  imagePreviewContainer.classList.add('hidden');
  imageFileInput.value = '';
}

function handlePasteImage(event) {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items;
  for (const item of items) {
    if (item.type.indexOf('image') === 0) {
      const blob = item.getAsFile();
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (blob.size > maxSize) {
        addMessageToUI("붙여넣은 이미지 크기가 너무 큽니다 (최대 5MB).", false, true);
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        imagePreview.src = e.target.result;
        imagePreviewContainer.classList.remove('hidden');
        attachedImage = {
          data: e.target.result,
          name: 'pasted-image.png',
          type: blob.type
        };
      };
      reader.readAsDataURL(blob);
      event.preventDefault();
      return;
    }
  }
}

// --- 기존 UI 헬퍼 함수들 ---
function toggleApiKeySection() {
  apiKeySection.classList.toggle('hidden');
}

function closeChatbot() {
  window.parent.postMessage({ type: "CLOSE_CHATBOT" }, "*");
}

function adjustTextareaHeight() {
  userInput.style.height = 'auto';
  let newHeight = userInput.scrollHeight;
  const maxHeight = 100; // CSS의 max-height와 동기화 필요
  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    userInput.style.overflowY = 'auto';
  } else {
    userInput.style.overflowY = 'hidden';
  }
  userInput.style.height = `${newHeight}px`;
}

function toggleFullscreen() {
  try {
    if (!isFullscreen()) {
      if (chatbotContainer.requestFullscreen) chatbotContainer.requestFullscreen().catch(handleFullscreenError);
      else if (chatbotContainer.mozRequestFullScreen) chatbotContainer.mozRequestFullScreen().catch(handleFullscreenError);
      else if (chatbotContainer.webkitRequestFullscreen) chatbotContainer.webkitRequestFullscreen().catch(handleFullscreenError);
      else if (chatbotContainer.msRequestFullscreen) chatbotContainer.msRequestFullscreen().catch(handleFullscreenError);
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(handleFullscreenError);
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen().catch(handleFullscreenError);
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(handleFullscreenError);
      else if (document.msExitFullscreen) document.msExitFullscreen().catch(handleFullscreenError);
    }
  } catch (error) {
    handleFullscreenError(error);
  }
}

function handleFullscreenError(error) {
  console.error("풀스크린 전환 중 오류:", error);
  // 사용자에게 알림 (예: toast 메시지)
  const tempMsg = addMessageToUI("풀스크린 전환에 실패했습니다. (iframe allowfullscreen 속성 필요)", false, true);
  setTimeout(() => tempMsg.remove(), 3000);
}


function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}

function updateFullscreenUI() {
  if (isFullscreen()) {
    fullscreenBtn.classList.add('hidden');
    fullscreenExitBtn.classList.remove('hidden');
    chatbotContainer.classList.add('fullscreen-mode');
  } else {
    fullscreenBtn.classList.remove('hidden');
    fullscreenExitBtn.classList.add('hidden');
    chatbotContainer.classList.remove('fullscreen-mode');
  }
}

function toggleTheme() {
  const isDarkMode = document.documentElement.classList.toggle('dark-mode');
  themeToggleBtn.textContent = isDarkMode ? 'light_mode' : 'dark_mode';
  chrome.storage.local.set({ theme: isDarkMode ? 'dark' : 'light' });
}

// 초기 메시지들을 지우는 함수 (새 대화 시작 시 호출 가능)
function clearChatMessages() {
  chatMessages.innerHTML = '';
  // 필요하다면 초기 안내 메시지 다시 추가
  // addMessageToUI("안녕하세요! 무엇을 도와드릴까요? ...", false);
}