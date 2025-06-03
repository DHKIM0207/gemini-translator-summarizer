// lib/google-generative-ai.esm.js 와 Readability.js를 import 할 수 있도록 설정 필요
// Manifest V3에서는 background service worker에서 직접 DOM에 접근할 수 없습니다.
// 페이지 내용 추출은 scripting API를 사용해야 합니다.

import { GoogleGenerativeAI } from './lib/google-generative-ai.esm.js'; // 경로 확인!

// PDF 파일 감지 및 리디렉션
chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    // 메인 프레임에서만 동작
    if (details.frameId !== 0) return;
    
    const url = details.url;
    
    // PDF 파일인지 확인 (URL이 .pdf로 끝나는 경우)
    if (url.toLowerCase().endsWith('.pdf') && !url.includes(chrome.runtime.getURL(''))) {
      // 커스텀 PDF 뷰어로 리디렉션
      const viewerUrl = chrome.runtime.getURL('pdf_viewer/viewer.html') + '?file=' + encodeURIComponent(url);
      chrome.tabs.update(details.tabId, { url: viewerUrl });
    }
  },
  { url: [{ urlMatches: '.*\\.pdf' }] }
);

// PDF 뷰어 페이지는 manifest.json의 content_scripts에서 자동으로 처리됨

// PDF 뷰어는 직접 챗봇 UI를 로드하도록 변경

// Readability.js를 사용하기 위한 함수
async function getPageContentWithReadability(tabId) {
  try {
    // Readability.js를 대상 탭에 주입하고 실행
    // Readability.js 파일이 web_accessible_resources에 등록되어 있어야 함
    // 또는 Readability.js 코드를 직접 문자열로 만들어 func에 전달할 수도 있음.
    // 여기서는 Readability.js가 web_accessible_resources에 있고, 해당 경로를 content script가 알고 있다고 가정합니다.
    // 더 나은 방법은 Readability.js를 background script와 함께 패키징하는 것입니다.
    // 이 예제에서는 Readability.js 코드를 직접 가져와서 실행합니다.

    // Readability.js 소스 코드를 가져오는 방법 (프로젝트에 포함된 파일을 읽거나, 문자열로 직접 삽입)
    // 여기서는 fetch를 사용하여 web_accessible_resources에서 가져오는 예시를 보이지만,
    // 실제로는 빌드 시점에 포함하거나, 직접 코드를 복붙하는 것이 더 안정적입니다.
    const readabilitySrcUrl = chrome.runtime.getURL('lib/Readability.js');
    const response = await fetch(readabilitySrcUrl);
    const readabilityScriptText = await response.text();


    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (scriptText) => {
        // Readability.js 코드를 실행할 수 있도록 동적으로 script 태그를 만들어 주입하고 실행
        // 이 방식은 CSP 문제 때문에 복잡할 수 있습니다.

        // 대안: Readability 클래스 정의를 직접 여기에 삽입하거나,
        // 라이브러리를 모듈 형태로 사용할 수 있다면 그것을 활용합니다.
        // 여기서는 Readability가 전역에 노출된다고 가정하고 시도합니다.

        // 임시로 document.body.innerText 사용 (더 안정적인 Readability 연동 필요)
        // return document.body.innerText;

        // --- Readability.js 직접 실행 시도 ---
        // 이 부분은 실제 Readability.js 코드를 여기에 삽입하거나,
        // 안전한 방식으로 실행할 수 있는 방법을 찾아야 합니다.
        // 아래는 개념적인 코드이며, Readability.js의 실제 구현에 따라 수정 필요
        // (function() { /* Readability.js 코드 전체 */ })()
        // const article = new Readability(document.cloneNode(true)).parse();
        // return article ? article.textContent : document.body.innerText;

        // 가장 간단한 방법 (하지만 정확도 떨어짐)
        return document.body.innerText;
      },
      // args: [readabilityScriptText] // func에 인자로 전달
    });
    if (results && results.length > 0 && results[0].result) {
      return results[0].result;
    }
    return null;

  } catch (e) {
    console.error("Error in getPageContentWithReadability:", e);
    throw e;
  }
}


// 메시지 리스너 (content script 또는 chatbot UI로부터)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SAVE_API_KEY") {
    chrome.storage.local.set({ geminiApiKey: request.apiKey }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // 비동기 응답을 위해 true 반환
  }
  else if (request.type === "LOAD_API_KEY") {
    chrome.storage.local.get(['geminiApiKey'], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ apiKey: null, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ apiKey: result.geminiApiKey });
      }
    });
    return true; // 비동기 응답
  }
  else if (request.type === "SET_THEME") {
    // 테마 설정 저장
    chrome.storage.local.set({ theme: request.theme }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // 비동기 응답
  }
  else if (request.type === "GET_THEME") {
    // 저장된 테마 설정 가져오기
    chrome.storage.local.get(['theme'], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ theme: 'light', error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ theme: result.theme || 'light' });
      }
    });
    return true; // 비동기 응답
  }
  else if (request.type === "GEMINI_CHAT_REQUEST") {
    // 스트리밍 API 호출
    const { apiKey, prompt, streamId } = request; // streamId는 챗봇 UI에서 스트리밍 응답을 식별하기 위함
    callGeminiApiStreaming(apiKey, prompt, sender.tab?.id, streamId); // sender.tab.id는 챗봇 UI가 content script iframe 내에 있을 때 유효
    sendResponse({ success: true, message: "스트리밍 요청 시작됨" }); // 즉시 응답
    return false; // 스트리밍은 별도로 메시지를 보냄
  }
  else if (request.type === "GEMINI_CHAT_WITH_IMAGE_REQUEST") {
    // 이미지와 함께 스트리밍 API 호출
    const { apiKey, prompt, imageData, streamId } = request;
    callGeminiApiWithImageStreaming(apiKey, prompt, imageData, sender.tab?.id, streamId);
    sendResponse({ success: true, message: "이미지와 함께 스트리밍 요청 시작됨" });
    return false; // 스트리밍은 별도로 메시지를 보냄
  }
  else if (request.type === "EXTRACT_PAGE_CONTENT_FROM_BG") {
    // 현재 활성 탭의 ID를 가져와서 내용 추출
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          throw new Error("활성 탭을 찾을 수 없습니다.");
        }
        // Readability.js 로직을 여기서 실행 (scripting API 사용)
        // Readability.js 코드를 주입하고 실행
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['lib/Readability.js'] // web_accessible_resources에 등록되어야 함
        });

        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            try {
              const documentClone = document.cloneNode(true);
              const article = new Readability(documentClone).parse();
              return article && article.textContent ? article.textContent : document.body.innerText;
            } catch (e) {
              console.warn("Readability 실행 중 오류 in BG:", e);
              return document.body.innerText; // 실패 시 fallback
            }
          }
        });

        if (chrome.runtime.lastError) {
          throw new Error(chrome.runtime.lastError.message);
        }

        if (injectionResults && injectionResults[0] && injectionResults[0].result) {
          sendResponse({ content: injectionResults[0].result });
        } else {
          sendResponse({ content: "", error: "페이지 내용 추출 결과 없음" });
        }

      } catch (error) {
        console.error("Error in EXTRACT_PAGE_CONTENT_FROM_BG:", error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // 비동기 응답
  }
  return false;
});

async function callGeminiApiStreaming(apiKey, promptText, tabIdForStream, streamId) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  try {
    const streamResult = await model.generateContentStream({
      contents: [{ parts: [{ text: promptText }] }],
    });

    for await (const chunk of streamResult.stream) {
      if (chunk && chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts && chunk.candidates[0].content.parts[0]) {
        const chunkText = chunk.candidates[0].content.parts[0].text;
        // 챗봇 UI (iframe)로 스트리밍 데이터 전송
        // 모든 탭에 일단 보내고, chatbot.js에서 수신하여 처리하는 방식 (간단하지만 비효율적일 수 있음)
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { // content.js로 보냄
              type: "GEMINI_STREAMING_RESPONSE",  // GEMINI_STREAM_CHUNK 대신 GEMINI_STREAMING_RESPONSE 사용
              streamId: streamId,
              text: chunkText,  // chunk 대신 text 사용
              done: false // 스트림이 계속됨을 의미
            }).catch(error => { /* console.warn("Failed to send stream chunk to tab:", tab.id, error) */ });
          });
        });
      }
    }
    // 스트림 종료 메시지
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: "GEMINI_STREAMING_RESPONSE",  // GEMINI_STREAM_CHUNK 대신 GEMINI_STREAMING_RESPONSE 사용 
          streamId: streamId,
          text: "",  // chunk 대신 text 사용
          done: true // 스트림 종료
        }).catch(error => { /* console.warn("Failed to send final stream chunk to tab:", tab.id, error) */ });
      });
    });

  } catch (error) {
    console.error("Gemini API 스트리밍 중 에러 (background):", error);
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: "GEMINI_STREAMING_RESPONSE",  // GEMINI_STREAM_ERROR 대신 GEMINI_STREAMING_RESPONSE 사용
          streamId: streamId,
          error: error.message
        }).catch(err => { });
      });
    });
  }
}

// 이미지와 함께 Gemini API 스트리밍 호출 함수
async function callGeminiApiWithImageStreaming(apiKey, promptText, imageData, tabIdForStream, streamId) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  try {
    // base64 형식의 이미지 데이터에서 헤더 제거
    let base64Image = imageData;
    if (base64Image.startsWith('data:image')) {
      base64Image = base64Image.split(',')[1];
    }

    // Gemini API 요청 구성
    const streamResult = await model.generateContentStream({
      contents: [{
        parts: [
          { text: promptText },
          {
            inline_data: {
              data: base64Image,
              mime_type: "image/jpeg" // 실제 이미지 타입에 맞게 수정 필요
            }
          }
        ]
      }],
    });

    // 스트리밍 응답 처리
    for await (const chunk of streamResult.stream) {
      if (chunk && chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts && chunk.candidates[0].content.parts[0]) {
        const chunkText = chunk.candidates[0].content.parts[0].text;
        // 챗봇 UI로 스트리밍 데이터 전송
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: "GEMINI_STREAMING_RESPONSE",
              streamId: streamId,
              text: chunkText,
              done: false
            }).catch(error => { /* 오류 무시 */ });
          });
        });
      }
    }

    // 스트림 종료 메시지
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: "GEMINI_STREAMING_RESPONSE",
          streamId: streamId,
          text: "",
          done: true
        }).catch(error => { /* 오류 무시 */ });
      });
    });

  } catch (error) {
    console.error("Gemini API 이미지 스트리밍 중 에러:", error);
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: "GEMINI_STREAMING_RESPONSE",
          streamId: streamId,
          error: error.message
        }).catch(err => { });
      });
    });
  }
}