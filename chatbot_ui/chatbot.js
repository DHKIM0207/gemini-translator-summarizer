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

// 폰트 설정 관련 요소
const fontSelect = document.getElementById('fontSelect');
const fontSizeSlider = document.getElementById('fontSizeSlider');
const fontSizeValue = document.getElementById('fontSizeValue');
const saveFontSettingsBtn = document.getElementById('saveFontSettingsBtn');

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

// 한국어 지원 Google Fonts 목록
const koreanFonts = [
  { name: 'Noto Sans KR', value: 'Noto Sans KR' },
  { name: 'Nanum Gothic', value: 'Nanum Gothic' },
  { name: 'Nanum Myeongjo', value: 'Nanum Myeongjo' },
  { name: 'Nanum Pen Script', value: 'Nanum Pen Script' },
  { name: 'Black Han Sans', value: 'Black Han Sans' },
  { name: 'Do Hyeon', value: 'Do Hyeon' },
  { name: 'Gothic A1', value: 'Gothic A1' },
  { name: 'Jua', value: 'Jua' },
  { name: 'Sunflower', value: 'Sunflower' },
  { name: 'Gamja Flower', value: 'Gamja Flower' },
  { name: 'Hi Melody', value: 'Hi Melody' },
  { name: 'Cute Font', value: 'Cute Font' },
  { name: 'Single Day', value: 'Single Day' },
  { name: 'Gaegu', value: 'Gaegu' },
  { name: 'Stylish', value: 'Stylish' },
  { name: 'Poor Story', value: 'Poor Story' },
  { name: 'Song Myung', value: 'Song Myung' },
  { name: 'Dokdo', value: 'Dokdo' },
  { name: 'Hahmlet', value: 'Hahmlet' },
  { name: 'IBM Plex Sans KR', value: 'IBM Plex Sans KR' },
  { name: 'Gowun Dodum', value: 'Gowun Dodum' },
  { name: 'Gowun Batang', value: 'Gowun Batang' },
  { name: 'Noto Serif KR', value: 'Noto Serif KR' }
];

function initializeChatbot() {
  chrome.storage.local.get(['geminiApiKey', 'theme', 'fontFamily', 'fontSize'], (result) => {
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
    
    // 폰트 설정 로드
    if (result.fontFamily) {
      fontSelect.value = result.fontFamily;
      applyFont(result.fontFamily);
    }
    
    if (result.fontSize) {
      fontSizeSlider.value = result.fontSize;
      fontSizeValue.textContent = result.fontSize;
      applyFontSize(result.fontSize);
    }
    
    // 폰트 목록 초기화
    initializeFontList();
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
  
  // 폰트 설정 이벤트 리스너
  fontSizeSlider.addEventListener('input', (e) => {
    fontSizeValue.textContent = e.target.value;
    applyFontSize(e.target.value);
  });
  
  fontSelect.addEventListener('change', (e) => {
    applyFont(e.target.value);
  });
  
  saveFontSettingsBtn.addEventListener('click', saveFontSettings);

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
    } else if (request.type === "IS_PDF_VIEWER_RESULT" || request.type === "PDF_PAGE_CONTENT_RESULT" || request.type === "PDF_PAGE_CONTENT_ERROR") {
      // PDF 뷰어 관련 응답은 Promise 리스너에서 처리되므로 여기서는 무시
      return;
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "TRANSLATE_SELECTION_REQUEST_FROM_HOVER") {
      // Handled by window.addEventListener("message", ...)
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
      currentApiKey = null;
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
    if (!genAI) {
      addMessageToUI("Gemini AI 초기화 실패. API 키를 확인해주세요.", false, true);
      return false;
    }
  }

  try {
    const modelInstance = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",  // Gemini 2.0 Flash (자동 업데이트 버전)
      generationConfig: {
        maxOutputTokens: 8192,  // 출력 토큰 제한
        temperature: 0.7,
      }
    });
    chatSession = modelInstance.startChat({
      history: history,
    });
    console.log("새로운 ChatSession이 시작되었습니다.");
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
    initializeGenAI();
    if (startNewChatSession()) {
      setTimeout(() => {
        apiKeySection.classList.add('hidden');
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
    imageElement.className = "message-image";
    imageElement.alt = isUser ? "첨부 이미지" : "생성된 이미지";
    contentDiv.appendChild(imageElement);
  }

  const paragraph = document.createElement("p");
  let messageTextContent = text;

  if (isUser || isError) {
    paragraph.textContent = text;
  } else {
    try {
      paragraph.innerHTML = marked.parse(text);
    } catch (e) {
      console.error("Markdown 파싱 오류:", e);
      paragraph.textContent = text;
    }
  }
  contentDiv.appendChild(paragraph);

  messageDiv.appendChild(avatarDiv);
  messageDiv.appendChild(contentDiv);

  if (!isUser && !isError) {
    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.title = "내용 복사";
    copyButton.innerHTML = `
      <span class="material-symbols-rounded">content_copy</span>
      <span>복사</span>
    `;

    copyButton.addEventListener('click', () => {
      const textToCopy = paragraph.textContent || messageTextContent;

      navigator.clipboard.writeText(textToCopy).then(() => {
        const icon = copyButton.querySelector('.material-symbols-rounded');
        const textSpan = copyButton.querySelector('span:not(.material-symbols-rounded)');
        icon.textContent = 'done';
        textSpan.textContent = '복사됨';
        copyButton.classList.add('copied');
        
        // 토스트 메시지 표시
        showToast('클립보드에 복사되었습니다', 'success');

        setTimeout(() => {
          icon.textContent = 'content_copy';
          textSpan.textContent = '복사';
          copyButton.classList.remove('copied');
        }, 2000);
      }).catch(err => {
        console.error('클립보드 복사 실패:', err);
        showToast('복사에 실패했습니다', 'error');
      });
    });
    messageDiv.appendChild(copyButton);
  }

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return messageDiv;
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
    setTimeout(() => {
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
          resolve("");
        }
      }
    };
    window.addEventListener("message", listener);
    window.parent.postMessage({ type: "GET_SELECTED_TEXT", requestId: requestId }, "*");
    setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("선택된 텍스트 요청 시간 초과"));
    }, 5000);
  });
}

async function handleSummarizePage() {
  if (!chatSession && !startNewChatSession()) return;
  
  // PDF 페이지인지 확인
  const pdfInfo = await checkIfPdfViewerPage().catch(() => ({ isPdfViewer: false }));
  
  if (pdfInfo.isPdfViewer) {
    // PDF 뷰어 페이지인 경우 현재 페이지 요약
    const currentPage = pdfInfo.currentPage;
    
    addMessageToUI(`PDF ${currentPage}페이지 내용 요약을 요청합니다...`, true);
    loader.classList.remove('hidden');
    
    try {
      const pageContent = await getPdfPageContent(currentPage);
      if (!pageContent || pageContent.trim().length === 0) {
        addMessageToUI(`${currentPage}페이지의 내용을 가져올 수 없거나 내용이 없습니다.`, false, true);
        loader.classList.add('hidden');
        return;
      }
      const prompt = `다음은 PDF ${currentPage}페이지의 내용이야. 한국어로 핵심 내용을 중심으로 간결하게 요약해줘:\n\n${pageContent}`;
      await streamResponse(prompt);
    } catch (error) {
      addMessageToUI("PDF 페이지 요약 중 오류: " + error.message, false, true);
      loader.classList.add('hidden');
    }
  } else {
    // 일반 웹페이지인 경우 기존 로직 유지
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
}

async function handleTranslatePage() {
  if (!chatSession && !startNewChatSession()) return;
  
  // PDF 페이지인지 확인
  const pdfInfo = await checkIfPdfViewerPage().catch(() => ({ isPdfViewer: false }));
  
  if (pdfInfo.isPdfViewer) {
    // PDF 뷰어 페이지인 경우 현재 페이지 번역
    const currentPage = pdfInfo.currentPage;
    
    addMessageToUI(`PDF ${currentPage}페이지 번역을 요청합니다...`, true);
    loader.classList.remove('hidden');
    
    try {
      const pageContent = await getPdfPageContent(currentPage);
      if (!pageContent || pageContent.trim().length === 0) {
        addMessageToUI(`${currentPage}페이지의 내용을 가져올 수 없거나 내용이 없습니다.`, false, true);
        loader.classList.add('hidden');
        return;
      }
      const targetLanguage = "한국어";
      const prompt = `다음 텍스트는 PDF ${currentPage}페이지의 내용이야. 이 내용을 ${targetLanguage}(으)로 자연스럽게 번역해줘:\n\n${pageContent}`;
      await streamResponse(prompt);
    } catch (error) {
      addMessageToUI("PDF 페이지 번역 중 오류: " + error.message, false, true);
      loader.classList.add('hidden');
    }
  } else {
    // 일반 웹페이지인 경우 기존 로직 유지
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
}

async function handleTranslateSelectedText(textToTranslate = null) {
  if (!chatSession && !startNewChatSession()) return;

  loader.classList.remove('hidden');
  try {
    let selectedText = textToTranslate || await getSelectedTextFromPage();
    
    // selectedText를 문자열로 변환하고 검증
    if (selectedText === null || selectedText === undefined) {
      selectedText = "";
    } else {
      selectedText = String(selectedText);
    }

    if (!selectedText || selectedText.trim().length === 0) {
      // PDF 페이지인지 확인
      const isPdf = await checkIfPdfPage().catch(() => false);
      
      if (isPdf) {
        addMessageToUI("PDF에서 텍스트를 선택할 수 없습니다.\n\n번역하려는 텍스트를 아래 입력창에 직접 복사하여 붙여넣고 전송해주세요.", false, true);
      } else {
        addMessageToUI("번역할 텍스트가 선택되지 않았습니다.", false, true);
      }
      loader.classList.add('hidden');
      return;
    }

    // 선택된 텍스트가 있는 경우 사용자에게 표시
    const displayText = selectedText.length > 100 ? selectedText.substring(0, 100) + "..." : selectedText;
    addMessageToUI(`선택된 텍스트 번역: "${displayText}"`, true);

    const targetLanguage = "한국어";
    const prompt = `다음 텍스트를 ${targetLanguage}(으)로 번역해줘:\n\n"${selectedText}"`;
    await streamResponse(prompt);
  } catch (error) {
    addMessageToUI("선택 영역 번역 중 오류: " + error.message, false, true);
    loader.classList.add('hidden');
  }
}

// PDF 페이지인지 확인하는 함수 추가
async function checkIfPdfPage() {
  return new Promise((resolve) => {
    const requestId = `pdf_check_req_${Date.now()}`;
    let resolved = false;
    
    const listener = (event) => {
      if (event.source === window.parent && event.data && event.data.requestId === requestId) {
        window.removeEventListener("message", listener);
        resolved = true;
        resolve(event.data.isPdf || false);
      }
    };
    
    window.addEventListener("message", listener);
    window.parent.postMessage({ type: "CHECK_IS_PDF", requestId: requestId }, "*");
    
    // 타임아웃 처리
    setTimeout(() => {
      if (!resolved) {
        window.removeEventListener("message", listener);
        resolve(false);
      }
    }, 1000);
  });
}

// PDF 뷰어 페이지인지 확인하는 함수 추가 (커스텀 뷰어)
async function checkIfPdfViewerPage() {
  return new Promise((resolve) => {
    const requestId = `pdf_viewer_check_req_${Date.now()}`;
    let resolved = false;
    
    const listener = (event) => {
      if (event.source === window.parent && event.data && event.data.requestId === requestId) {
        window.removeEventListener("message", listener);
        resolved = true;
        resolve({
          isPdfViewer: event.data.isPdfViewer || false,
          currentPage: event.data.currentPage || 1,
          totalPages: event.data.totalPages || 0
        });
      }
    };
    
    window.addEventListener("message", listener);
    window.parent.postMessage({ type: "CHECK_IS_PDF_VIEWER", requestId: requestId }, "*");
    
    // 타임아웃 처리
    setTimeout(() => {
      if (!resolved) {
        window.removeEventListener("message", listener);
        resolve({ isPdfViewer: false, currentPage: 1, totalPages: 0 });
      }
    }, 1000);
  });
}

// 특정 PDF 페이지 내용 가져오기
async function getPdfPageContent(pageNumber) {
  return new Promise((resolve, reject) => {
    const requestId = `pdf_page_content_req_${Date.now()}`;
    const listener = (event) => {
      if (event.source === window.parent && event.data && event.data.requestId === requestId) {
        window.removeEventListener("message", listener);
        if (event.data.type === "PDF_PAGE_CONTENT_RESULT") {
          resolve(event.data.content);
        } else {
          reject(new Error(event.data.error || "PDF 페이지 내용을 가져오지 못했습니다."));
        }
      }
    };
    window.addEventListener("message", listener);
    window.parent.postMessage({ 
      type: "GET_PDF_PAGE_CONTENT", 
      pageNumber: pageNumber,
      requestId: requestId 
    }, "*");
    setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error("PDF 페이지 내용 요청 시간 초과"));
    }, 10000);
  });
}


async function streamResponse(promptText, imageParts = null) {
  if (!chatSession && !startNewChatSession()) {
    loader.classList.add('hidden');
    return;
  }

  const botMessageDiv = addMessageToUI("답변 생성 중...", false);
  const contentDiv = botMessageDiv.querySelector('.message-content');
  const paragraph = contentDiv.querySelector('p');
  const copyButton = botMessageDiv.querySelector('.copy-button');

  if (paragraph) paragraph.innerHTML = "";

  try {
    const contentRequest = [];
    if (promptText) {
      contentRequest.push({ text: promptText });
    }
    if (imageParts) {
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
        const chunkText = chunk.text();
        accumulatedText += chunkText;
        if (paragraph) {
          try {
            paragraph.innerHTML = marked.parse(accumulatedText);
          } catch (e) {
            console.error("Markdown 파싱 중 오류:", e);
            paragraph.textContent = accumulatedText;
          }
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
    

    if (copyButton) {
      const newCopyButton = copyButton.cloneNode(true);
      copyButton.parentNode.replaceChild(newCopyButton, copyButton);

      newCopyButton.addEventListener('click', () => {
        const finalParagraph = newCopyButton.closest('.message').querySelector('.message-content p');
        const textToCopy = finalParagraph ? finalParagraph.textContent : accumulatedText;

        navigator.clipboard.writeText(textToCopy).then(() => {
          const icon = newCopyButton.querySelector('.material-symbols-rounded');
          const textSpan = newCopyButton.querySelector('span:not(.material-symbols-rounded)');
          icon.textContent = 'done';
          textSpan.textContent = '복사됨';
          newCopyButton.classList.add('copied');
          
          // 토스트 메시지 표시
          showToast('클립보드에 복사되었습니다', 'success');

          setTimeout(() => {
            icon.textContent = 'content_copy';
            textSpan.textContent = '복사';
            newCopyButton.classList.remove('copied');
          }, 2000);
        }).catch(err => {
          console.error('클립보드 복사 실패:', err);
          showToast('복사에 실패했습니다', 'error');
        });
      });
    }

  } catch (error) {
    console.error("Gemini API 스트리밍 오류 (ChatSession):", error);
    if (paragraph) {
      paragraph.innerHTML = `<span class="error-message">API 오류: ${error.message || '알 수 없는 오류'}</span>`;
      if (copyButton) copyButton.remove();
    } else {
      addMessageToUI(`API 오류: ${error.message || '알 수 없는 오류'}`, false, true);
    }
  } finally {
    loader.classList.add('hidden');
  }
}


function sendMessage() {
  const text = userInput.value.trim();
  if (!text && !attachedImage) return;

  if (!chatSession && !startNewChatSession()) return;

  if (text || attachedImage) {
    addMessageToUI(text, true, false, attachedImage ? attachedImage.data : null);
  }

  userInput.value = "";
  userInput.style.height = 'auto';

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

  removeAttachedImage();
  loader.classList.remove('hidden');

  streamResponse(text || (imageContentPart ? "이 이미지에 대해 설명해주세요." : ""), imageContentPart);
}


function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    addMessageToUI("이미지 파일만 첨부할 수 있습니다.", false, true);
    return;
  }
  const maxSize = 5 * 1024 * 1024;
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
      const maxSize = 5 * 1024 * 1024;
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

function toggleApiKeySection() {
  apiKeySection.classList.toggle('hidden');
}

function closeChatbot() {
  window.parent.postMessage({ type: "CLOSE_CHATBOT" }, "*");
}

function adjustTextareaHeight() {
  userInput.style.height = 'auto';
  let newHeight = userInput.scrollHeight;
  const maxHeight = 150;
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

function clearChatMessages() {
  chatMessages.innerHTML = '';
  addMessageToUI("안녕하세요! 무엇을 도와드릴까요? 페이지 전체에 대해서는 '페이지 요약' 또는 '페이지 번역' 버튼을, 선택한 텍스트에 대해서는 '선택 영역 번역' 버튼을 사용하거나, 직접 메시지를 입력해주세요.", false);
}

// 폰트 목록 초기화
function initializeFontList() {
  // 기본 옵션 유지
  fontSelect.innerHTML = '<option value="">기본 폰트</option>';
  
  // 한국어 폰트 추가
  koreanFonts.forEach(font => {
    const option = document.createElement('option');
    option.value = font.value;
    option.textContent = font.name;
    fontSelect.appendChild(option);
  });
}

// 폰트 적용
function applyFont(fontFamily) {
  if (!fontFamily) {
    // 기본 폰트로 복원
    document.documentElement.style.removeProperty('--chat-font-family');
  } else {
    // Google Fonts 로드
    loadGoogleFont(fontFamily);
    
    // CSS 변수로 폰트 설정
    document.documentElement.style.setProperty('--chat-font-family', `'${fontFamily}', 'Noto Sans KR', sans-serif`);
  }
}

// 폰트 크기 적용
function applyFontSize(size) {
  document.documentElement.style.setProperty('--chat-font-size', `${size}px`);
}

// Google Fonts 로드
function loadGoogleFont(fontFamily) {
  const linkId = `google-font-${fontFamily.replace(/\s+/g, '-')}`;
  
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@300;400;500;700&display=swap`;
    document.head.appendChild(link);
  }
}

// 폰트 설정 저장
function saveFontSettings() {
  const fontFamily = fontSelect.value;
  const fontSize = fontSizeSlider.value;
  
  chrome.storage.local.set({
    fontFamily: fontFamily,
    fontSize: fontSize
  }, () => {
    // 저장 완료 메시지 표시
    const msg = document.createElement('p');
    msg.textContent = '폰트 설정이 저장되었습니다.';
    msg.style.color = '#10b981';
    msg.style.marginTop = '0.5rem';
    msg.style.fontSize = '0.9rem';
    
    saveFontSettingsBtn.parentNode.appendChild(msg);
    
    setTimeout(() => {
      msg.remove();
    }, 2000);
  });
}

// 토스트 메시지 표시 함수
function showToast(message, type = 'default') {
  const toastContainer = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = document.createElement('span');
  icon.className = 'material-symbols-rounded';
  icon.textContent = type === 'success' ? 'check_circle' : 'info';
  
  const text = document.createElement('span');
  text.textContent = message;
  
  toast.appendChild(icon);
  toast.appendChild(text);
  toastContainer.appendChild(toast);
  
  // 3초 후 사라지게 하기
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}