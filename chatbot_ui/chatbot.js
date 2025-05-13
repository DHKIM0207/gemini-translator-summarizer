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

// 풀스크린 관련 요소
const fullscreenBtn = document.getElementById('fullscreen-btn');
const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');
const chatbotContainer = document.getElementById('chatbot-container');

// 테마 토글 버튼
const themeToggleBtn = document.getElementById('theme-toggle-btn');

const summarizePageBtn = document.getElementById('summarizePageBtn');
const translatePageBtn = document.getElementById('translatePageBtn');
const translateSelectionBtn = document.getElementById('translateSelectionBtn');

// 이미지 첨부 관련 요소
const imageUploadBtn = document.getElementById('image-upload-btn');
const imageFileInput = document.getElementById('image-file-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image');

let currentApiKey = null;
// let currentPageContent = null; // 이제 각 핸들러에서 필요시 가져옴
let activeStreamId = null;
let attachedImage = null; // 첨부된 이미지를 저장할 변수

// marked.js 옵션 설정
marked.setOptions({
  gfm: true,
  breaks: true, // \n을 <br>로 자동 변환하도록 설정
});

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', initializeChatbot);

// chatbot 초기화 함수
function initializeChatbot() {
  // 이전 API 키 로드
  chrome.storage.local.get(['geminiApiKey', 'theme'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
      currentApiKey = result.geminiApiKey;
    }

    // 테마 설정 로드 및 적용
    if (result.theme === 'dark') {
      document.documentElement.classList.add('dark-mode');
      themeToggleBtn.textContent = 'light_mode'; // 다크모드에서는 해 아이콘
    } else {
      document.documentElement.classList.remove('dark-mode');
      themeToggleBtn.textContent = 'dark_mode'; // 라이트모드에서는 달 아이콘
    }
  });

  // 이벤트 리스너 등록
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  fullscreenExitBtn.addEventListener('click', toggleFullscreen);
  settingsBtn.addEventListener('click', toggleApiKeySection);
  saveApiKeyBtn.addEventListener('click', saveApiKey);
  closeChatbotBtn.addEventListener('click', closeChatbot);

  // 테마 토글 버튼 이벤트 리스너
  themeToggleBtn.addEventListener('click', toggleTheme);

  // 기능 버튼 이벤트 리스너
  summarizePageBtn.addEventListener('click', handleSummarizePage);
  translatePageBtn.addEventListener('click', handleTranslatePage);
  translateSelectionBtn.addEventListener('click', handleTranslateSelectedText);

  // 이미지 버튼 이벤트 리스너
  imageUploadBtn.addEventListener('click', () => imageFileInput.click());
  imageFileInput.addEventListener('change', handleImageUpload);
  removeImageBtn.addEventListener('click', removeAttachedImage);

  // 클립보드 붙여넣기 이벤트 리스너
  userInput.addEventListener('paste', handlePasteImage);

  // 메시지 전송 버튼 클릭 이벤트
  sendBtn.addEventListener('click', () => {
    const text = userInput.value.trim();
    if (text || attachedImage) {
      sendMessage();
    }
  });

  // 메시지 입력창 엔터 키 이벤트
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = userInput.value.trim();
      if (text || attachedImage) {
        sendMessage();
      }
    }
  });

  // 텍스트 영역 자동 높이 조절
  userInput.addEventListener('input', adjustTextareaHeight);

  // 풀스크린 변경 감지 이벤트 리스너
  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
  document.addEventListener('mozfullscreenchange', updateFullscreenUI);
  document.addEventListener('MSFullscreenChange', updateFullscreenUI);

  // 메시지 수신 이벤트 리스너
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "TRANSLATE_SELECTION_REQUEST_FROM_HOVER") {
      if (request.selectedText) {
        const snippet = request.selectedText.length > 50 ? request.selectedText.substring(0, 50) + "..." : request.selectedText;
        addMessage(`[페이지 선택] "${snippet}" 번역 요청됨`, true);
        handleTranslateSelectedText();
      } else {
        addMessage("호버 버튼에서 전달된 텍스트가 없습니다.", false, true);
      }
    } else if (request.type === "GEMINI_STREAMING_RESPONSE") {
      // 백그라운드에서 온 스트리밍 응답 처리
      console.log("Received streaming response from background:", request.streamId);
      handleGeminiStreamingResponse(request);
    }
    return true; // 비동기 응답 허용
  });
}

// API 키 저장 함수
function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    apiKeyMsg.textContent = 'API 키를 입력해주세요.';
    apiKeyMsg.style.color = '#ef4444';
    return;
  }

  currentApiKey = apiKey;
  chrome.storage.local.set({ 'geminiApiKey': apiKey }, function () {
    showApiKeySavedMessage();
  });
}

// API 키 저장 성공 메시지
function showApiKeySavedMessage() {
  apiKeyMsg.textContent = 'API 키가 성공적으로 저장되었습니다.';
  apiKeyMsg.style.color = '#10b981';
  setTimeout(() => {
    apiKeySection.classList.add('hidden');
    addMessage('API 키가 설정되었습니다. 이제 질문하실 수 있습니다.', false);
  }, 1500);
}

// 에러 처리 함수
function handleError(error) {
  console.error('Error:', error);
  addMessage(`오류가 발생했습니다: ${error.message || error}`, false, true);
  loader.classList.add('hidden');
}

// 풀스크린 기능 구현
function toggleFullscreen() {
  try {
    if (!isFullscreen()) {
      // 풀스크린 모드로 전환
      if (chatbotContainer.requestFullscreen) {
        chatbotContainer.requestFullscreen().catch(error => handleFullscreenError(error));
      } else if (chatbotContainer.mozRequestFullScreen) { // Firefox
        chatbotContainer.mozRequestFullScreen().catch(error => handleFullscreenError(error));
      } else if (chatbotContainer.webkitRequestFullscreen) { // Chrome, Safari, Opera
        chatbotContainer.webkitRequestFullscreen().catch(error => handleFullscreenError(error));
      } else if (chatbotContainer.msRequestFullscreen) { // IE/Edge
        chatbotContainer.msRequestFullscreen().catch(error => handleFullscreenError(error));
      }
    } else {
      // 풀스크린 모드 종료
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(error => handleFullscreenError(error));
      } else if (document.mozCancelFullScreen) { // Firefox
        document.mozCancelFullScreen().catch(error => handleFullscreenError(error));
      } else if (document.webkitExitFullscreen) { // Chrome, Safari, Opera
        document.webkitExitFullscreen().catch(error => handleFullscreenError(error));
      } else if (document.msExitFullscreen) { // IE/Edge
        document.msExitFullscreen().catch(error => handleFullscreenError(error));
      }
    }
  } catch (error) {
    handleFullscreenError(error);
  }
}

// 풀스크린 오류 처리 함수
function handleFullscreenError(error) {
  console.error("풀스크린 전환 중 오류 발생:", error);
  // 풀스크린 권한 오류 시 사용자에게 알림
  const errorMessage = "풀스크린 기능을 사용할 수 없습니다. iframe에 allowfullscreen 속성이 필요합니다.";

  // 일시적으로 나타날 메시지 요소 생성
  const messageElement = document.createElement('div');
  messageElement.textContent = errorMessage;
  messageElement.style.position = 'absolute';
  messageElement.style.bottom = '10px';
  messageElement.style.left = '50%';
  messageElement.style.transform = 'translateX(-50%)';
  messageElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  messageElement.style.color = 'white';
  messageElement.style.padding = '8px 16px';
  messageElement.style.borderRadius = '4px';
  messageElement.style.zIndex = '1000';

  document.body.appendChild(messageElement);

  // 3초 후 메시지 제거
  setTimeout(() => {
    document.body.removeChild(messageElement);
  }, 3000);
}

// 풀스크린 상태 확인 함수
function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

// 풀스크린 상태 변경 시 UI 업데이트
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

// --- 함수 ---
function addMessage(text, isUser = false, isError = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = isUser ? "message user-message" : "message bot-message";

  // 아바타 추가
  const avatarDiv = document.createElement("div");
  avatarDiv.className = "message-avatar";
  const avatarIcon = document.createElement("span");
  avatarIcon.className = "material-symbols-rounded";
  avatarIcon.textContent = isUser ? "person" : "smart_toy";
  avatarDiv.appendChild(avatarIcon);

  // 메시지 내용 컨테이너
  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (isError) {
    messageDiv.classList.add("error");
  }

  const paragraph = document.createElement("p");

  if (isUser) {
    paragraph.textContent = text;
  } else {
    // 봇 메시지는 마크다운 지원
    paragraph.innerHTML = marked.parse(text);
  }

  contentDiv.appendChild(paragraph);
  messageDiv.appendChild(avatarDiv);
  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);

  // 스크롤을 맨 아래로 이동
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return messageDiv;
}

let pageContentRequestId = 0;

async function getPageContentForChat() {
  return new Promise((resolve, reject) => {
    const currentRequestId = `page_${++pageContentRequestId}`;
    window.parent.postMessage({ type: "GET_PAGE_CONTENT", requestId: currentRequestId }, "*");
    const listener = (event) => {
      if (event.source === window.parent && event.data && event.data.requestId === currentRequestId) {
        window.removeEventListener("message", listener);
        if (event.data.type === "PAGE_CONTENT_RESULT" && typeof event.data.content === 'string') {
          resolve(event.data.content);
        } else {
          reject(new Error(event.data.error || "페이지 내용을 가져오지 못했습니다."));
        }
      }
    };
    window.addEventListener("message", listener);
    setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("페이지 내용 요청 시간 초과"));
    }, 10000);
  });
}

async function getSelectedTextFromPage() {
  return new Promise((resolve, reject) => {
    const currentRequestId = `selection_${++pageContentRequestId}`;
    window.parent.postMessage({ type: "GET_SELECTED_TEXT", requestId: currentRequestId }, "*");
    const listener = (event) => {
      if (event.source === window.parent && event.data && event.data.requestId === currentRequestId) {
        window.removeEventListener("message", listener);
        if (event.data.type === "SELECTED_TEXT_RESULT" && typeof event.data.selectedText === 'string') {
          resolve(event.data.selectedText);
        } else {
          // 선택된 텍스트가 없는 경우에도 오류 대신 빈 문자열 반환 가능
          resolve(""); // 또는 reject(new Error(event.data.error || "선택된 텍스트를 가져오지 못했습니다."));
        }
      }
    };
    window.addEventListener("message", listener);
    setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("선택된 텍스트 요청 시간 초과"));
    }, 5000);
  });
}

async function handleSummarizePage() {
  if (!currentApiKey) {
    addMessage("Gemini API 키가 설정되지 않았습니다.", "bot", true);
    apiKeySection.classList.remove('hidden');
    return;
  }
  addMessage("페이지 내용 요약을 요청합니다...", true);
  loader.classList.remove('hidden');
  try {
    const pageContent = await getPageContentForChat();
    if (!pageContent || pageContent.trim().length === 0) {
      addMessage("현재 페이지의 내용을 가져올 수 없거나 내용이 없습니다.", "bot", true);
      loader.classList.add('hidden');
      return;
    }
    const prompt = `다음 텍스트를 한국어로 핵심 내용을 중심으로 간결하게 요약해줘:\n\n${pageContent}`;
    initiateGeminiRequest(prompt);
  } catch (error) {
    addMessage("페이지 요약 중 오류: " + error.message, "bot", true);
    loader.classList.add('hidden');
  }
}

async function handleTranslatePage() {
  if (!currentApiKey) {
    addMessage("Gemini API 키가 설정되지 않았습니다.", "bot", true);
    apiKeySection.classList.remove('hidden');
    return;
  }
  addMessage("페이지 전체 번역을 요청합니다 (영어를 한국어로)...", true);
  loader.classList.remove('hidden');
  try {
    const pageContent = await getPageContentForChat();
    if (!pageContent || pageContent.trim().length === 0) {
      addMessage("현재 페이지의 내용을 가져올 수 없거나 내용이 없습니다.", "bot", true);
      loader.classList.add('hidden');
      return;
    }
    const targetLanguage = "한국어";
    const prompt = `다음 텍스트는 영어로 작성된 내용이야. 이 내용을 ${targetLanguage}(으)로 자연스럽게 번역해줘. HTML 태그나 코드는 번역 결과에 포함하지 마.:\n\n${pageContent}`;
    addMessage(`페이지의 영어 내용을 ${targetLanguage}(으)로 번역합니다.`, "bot");
    initiateGeminiRequest(prompt);
  } catch (error) {
    addMessage("페이지 번역 중 오류: " + error.message, "bot", true);
    loader.classList.add('hidden');
  }
}

// 선택 영역 번역 처리 함수
async function handleTranslateSelectedText() {
  if (!currentApiKey) {
    addMessage("API 키가 설정되지 않았습니다. 설정 버튼을 클릭하여 API 키를 설정해주세요.", false, true);
    apiKeySection.classList.remove('hidden');
    return;
  }

  loader.classList.remove('hidden');
  try {
    const selectedText = await getSelectedTextFromPage();

    if (!selectedText || selectedText.trim().length === 0) {
      addMessage("번역할 텍스트가 선택되지 않았습니다. 웹페이지에서 텍스트를 선택한 후 다시 시도해주세요.", false, true);
      loader.classList.add('hidden');
      return;
    }

    addMessage(`선택한 텍스트 번역을 요청합니다...`, true);

    const targetLanguage = "한국어";
    const prompt = `다음 텍스트를 ${targetLanguage}(으)로 번역해줘:\n\n"${selectedText}"`;
    const snippet = selectedText.length > 50 ? selectedText.substring(0, 50) + "..." : selectedText;

    initiateGeminiRequest(prompt, true, selectedText);
  } catch (error) {
    addMessage("선택 영역 요청/번역 중 오류: " + error.message, false, true);
    loader.classList.add('hidden');
  }
}

async function handleDirectUserInput(text) {
  if (!text) return;
  if (!currentApiKey) {
    addMessage("API 키가 설정되지 않았습니다. 설정 버튼을 클릭하여 API 키를 설정해주세요.", false, true);
    return;
  }
  addMessage(text, true);
  userInput.value = "";
  userInput.style.height = 'auto';
  loader.classList.remove('hidden');
  const prompt = text;
  addMessage("일반적인 질문으로 처리합니다...", "bot");
  initiateGeminiRequest(prompt);
}

// 이미지 요청 처리 함수
async function handleImageRequest(text, imageData) {
  if (!currentApiKey) {
    addMessage("API 키가 설정되지 않았습니다. 설정 버튼을 클릭하여 API 키를 설정해주세요.", false, true);
    return;
  }

  loader.classList.remove('hidden');
  addMessage("이미지 분석 중...", false);
  initiateGeminiRequest(text, false, "", imageData);
}

function initiateGeminiRequest(prompt, isTranslation = false, selectedText = "", imageData = null) {
  if (!currentApiKey) {
    addMessage("API 키가 설정되지 않았습니다. 설정 버튼을 클릭하여 API 키를 설정해주세요.", false, true);
    return;
  }

  activeStreamId = `stream_${Date.now()}`;
  const initialBotMessageDiv = addMessage("답변 생성 중...", false);

  // 메시지 요소에 스트림 ID 설정
  initialBotMessageDiv.setAttribute('data-stream-id', activeStreamId);

  // 이미지가 있는 경우와 없는 경우 분리
  if (imageData) {
    chrome.runtime.sendMessage({
      type: "GEMINI_CHAT_WITH_IMAGE_REQUEST",
      apiKey: currentApiKey,
      prompt: prompt,
      imageData: imageData.data,
      streamId: activeStreamId
    });
  } else {
    chrome.runtime.sendMessage({
      type: "GEMINI_CHAT_REQUEST",
      apiKey: currentApiKey,
      prompt: prompt,
      streamId: activeStreamId
    });
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !event.data) {
    return;
  }
  const request = event.data;

  // 호버 버튼으로부터 온 번역 요청 처리
  if (request.type === "TRANSLATE_SELECTION_FROM_HOVER") {
    console.log("Received TRANSLATE_SELECTION_FROM_HOVER in chatbot.js");
    loader.classList.remove('hidden'); // 로더 시작
    if (request.selectedText) {
      // 사용자 입력 표시 (호버 버튼 클릭)
      const snippet = request.selectedText.length > 50 ? request.selectedText.substring(0, 50) + "..." : request.selectedText;
      addMessage(`[페이지 선택] "${snippet}" 번역 요청됨`, true);
      handleTranslateSelectedText();
    } else {
      addMessage("호버 버튼에서 전달된 텍스트가 없습니다.", false, true);
      loader.classList.add('hidden');
    }
    return; // 이 메시지 처리는 여기서 종료
  }

  // 스트리밍 데이터 처리 (수정된 부분)
  if (request.type === "GEMINI_STREAMING_RESPONSE") {
    if (request.streamId !== activeStreamId) {
      return; // 활성화된 스트림 ID와 다르면 무시
    }

    loader.classList.add('hidden');
    const messageElement = document.querySelector(`.message.bot-message[data-stream-id="${request.streamId}"]`);

    if (!messageElement) {
      console.error("메시지 요소를 찾을 수 없습니다:", request.streamId);
      return;
    }

    const paragraph = messageElement.querySelector('.message-content p');

    if (!paragraph) {
      console.error("메시지 요소 내 단락을 찾을 수 없습니다");
      return;
    }

    // 오류 처리
    if (request.error) {
      messageElement.classList.add('error');
      paragraph.innerHTML = `API 오류: ${request.error.replace(/\n/g, '<br>')}`;
      activeStreamId = null;
      return;
    }

    // 시작할 때 "답변 생성 중..." 텍스트 지우기
    if (paragraph.textContent === "답변 생성 중...") {
      paragraph._streamingText = "";
    } else if (!paragraph._streamingText) {
      paragraph._streamingText = "";
    }

    // 새 텍스트 추가
    if (request.text) {
      paragraph._streamingText += request.text;

      try {
        paragraph.innerHTML = marked.parse(paragraph._streamingText);
      } catch (e) {
        console.error("Markdown 파싱 오류:", e);
        paragraph.textContent = paragraph._streamingText;
      }

      // 스크롤 최신 상태로 유지
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 스트림 완료 처리
    if (request.done) {
      if (paragraph._streamingText) {
        try {
          paragraph.innerHTML = marked.parse(paragraph._streamingText);
        } catch (e) {
          console.error("최종 Markdown 파싱 오류:", e);
          paragraph.textContent = paragraph._streamingText;
        }
      }
      delete paragraph._streamingText;
      activeStreamId = null;
    }
  }
});

// toggleApiKeySection 함수 정의
function toggleApiKeySection() {
  apiKeySection.classList.toggle('hidden');
}

// closeChatbot 함수 정의 (초기화 함수에서 호출되지만 정의되지 않음)
function closeChatbot() {
  window.parent.postMessage({ type: "CLOSE_CHATBOT" }, "*");
}

// adjustTextareaHeight 함수 정의 (초기화 함수에서 호출되지만 정의되지 않음)
function adjustTextareaHeight() {
  userInput.style.height = 'auto';
  let newHeight = userInput.scrollHeight;
  const maxHeight = 100;
  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    userInput.style.overflowY = 'auto';
  } else {
    userInput.style.overflowY = 'hidden';
  }
  userInput.style.height = `${newHeight}px`;
}

// 스트리밍 응답 처리
async function handleGeminiStreamingResponse(response, responseMessageDiv = null) {
  try {
    const { text, done, streamId, error } = response;

    // 오류 처리
    if (error) {
      console.error("API Error:", error);
      addMessage(`오류가 발생했습니다: ${error}`, false, true);
      loader.classList.add('hidden');
      return;
    }

    // 활성 스트림 ID가 다르면 응답 무시
    if (streamId !== activeStreamId) {
      console.log("Ignoring outdated stream response", streamId, activeStreamId);
      return;
    }

    // responseMessageDiv가 없으면 찾거나 새로 생성
    if (!responseMessageDiv) {
      responseMessageDiv = document.querySelector(`.message.bot-message[data-stream-id="${streamId}"]`);
      if (!responseMessageDiv) {
        // 찾을 수 없으면 새로 생성
        responseMessageDiv = addMessage("", false);
        responseMessageDiv.setAttribute('data-stream-id', streamId);
      }
    }

    // 메시지 내용 업데이트
    const contentDiv = responseMessageDiv.querySelector('.message-content');
    const paragraph = contentDiv.querySelector('p');

    // 스트리밍 시작될 때, 기본 "답변 생성 중..." 메시지 지우기
    if (paragraph.textContent === "답변 생성 중...") {
      paragraph.textContent = "";
    }

    // 마크다운 파싱
    if (text) {
      const currentText = paragraph.innerHTML;
      try {
        paragraph.innerHTML = marked.parse(currentText + text);
      } catch (e) {
        console.error("Markdown parsing error:", e);
        paragraph.innerHTML = currentText + text;
      }
    }

    // 스트리밍 완료 시 로더 숨기기
    if (done) {
      loader.classList.add('hidden');
      activeStreamId = null;
    }

    // 스크롤을 항상 최신 상태로 유지
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (error) {
    console.error('Streaming error:', error);
    if (!responseMessageDiv) {
      addMessage('응답을 처리하는 중 오류가 발생했습니다: ' + error.message, false, true);
    } else {
      // 기존 메시지를 오류 메시지로 변경
      responseMessageDiv.classList.add('error');
      const contentDiv = responseMessageDiv.querySelector('.message-content');
      const paragraph = contentDiv.querySelector('p');
      paragraph.textContent = '응답을 처리하는 중 오류가 발생했습니다: ' + error.message;
    }
  } finally {
    loader.classList.add('hidden');
  }
}

// 이미지 업로드 처리 함수
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // 이미지 파일인지 확인
  if (!file.type.startsWith('image/')) {
    addMessage("이미지 파일만 첨부할 수 있습니다.", false, true);
    return;
  }

  // 파일 크기 제한 (예: 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    addMessage("이미지 크기가 너무 큽니다 (최대 5MB).", false, true);
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    // 이미지 미리보기 설정
    imagePreview.src = e.target.result;
    imagePreviewContainer.classList.remove('hidden');

    // 이미지 데이터 저장
    attachedImage = {
      data: e.target.result,
      name: file.name,
      type: file.type
    };
  };
  reader.onerror = function () {
    addMessage("이미지 파일을 읽는 중 오류가 발생했습니다.", false, true);
  };
  reader.readAsDataURL(file);
}

// 첨부된 이미지 제거 함수
function removeAttachedImage() {
  attachedImage = null;
  imagePreview.src = '';
  imagePreviewContainer.classList.add('hidden');
  imageFileInput.value = ''; // 파일 입력 초기화
}

// 클립보드 이미지 붙여넣기 처리 함수
function handlePasteImage(event) {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items;

  for (const item of items) {
    if (item.type.indexOf('image') === 0) {
      const blob = item.getAsFile();

      // 파일 크기 제한 (예: 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (blob.size > maxSize) {
        addMessage("이미지 크기가 너무 큽니다 (최대 5MB).", false, true);
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        // 이미지 미리보기 설정
        imagePreview.src = e.target.result;
        imagePreviewContainer.classList.remove('hidden');

        // 이미지 데이터 저장
        attachedImage = {
          data: e.target.result,
          name: 'pasted-image.png',
          type: blob.type
        };
      };
      reader.readAsDataURL(blob);

      // 텍스트 붙여넣기 기본 동작 방지
      event.preventDefault();
      return;
    }
  }
}

// 메시지 전송 함수
function sendMessage() {
  const text = userInput.value.trim();

  // 텍스트나 이미지가 있을 때만 처리
  if (!text && !attachedImage) return;

  // 메시지가 비어있지 않으면 사용자 메시지 추가
  if (text) {
    addMessage(text, true);
  }

  // 이미지가 첨부되어 있으면 이미지 메시지 추가
  if (attachedImage) {
    // 이미지를 포함한 메시지 생성
    const messageDiv = document.createElement("div");
    messageDiv.className = "message user-message";

    // 아바타 추가
    const avatarDiv = document.createElement("div");
    avatarDiv.className = "message-avatar";
    const avatarIcon = document.createElement("span");
    avatarIcon.className = "material-symbols-rounded";
    avatarIcon.textContent = "person";
    avatarDiv.appendChild(avatarIcon);

    // 메시지 내용 컨테이너
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";

    // 텍스트 메시지가 있으면 추가
    if (text) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      contentDiv.appendChild(paragraph);
    }

    // 이미지 추가
    const imageElement = document.createElement("img");
    imageElement.src = attachedImage.data;
    imageElement.className = "message-image";
    imageElement.alt = "첨부된 이미지";
    contentDiv.appendChild(imageElement);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // 스크롤을 맨 아래로 이동
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // 입력 필드 초기화
  userInput.value = "";
  userInput.style.height = 'auto';

  // 이미지 첨부 초기화와 Gemini API 요청
  const tempAttachedImage = attachedImage; // 임시 변수에 저장
  removeAttachedImage();

  // Gemini API 요청
  if (text) {
    handleDirectUserInput(text);
  } else if (tempAttachedImage) {
    // 이미지만 있는 경우 이미지 API 요청
    handleImageRequest("이 이미지에 대해 설명해주세요.", tempAttachedImage);
  }
}

// 테마 토글 함수
function toggleTheme() {
  const isDarkMode = document.documentElement.classList.toggle('dark-mode');

  // 아이콘 변경
  themeToggleBtn.textContent = isDarkMode ? 'light_mode' : 'dark_mode';

  // 설정 저장
  chrome.storage.local.set({ theme: isDarkMode ? 'dark' : 'light' });
}