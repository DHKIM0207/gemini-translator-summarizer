(function () {
  let fabButton = null;
  let chatbotIframe = null;
  let iframeVisible = false;
  let hoverTranslateButton = null;
  let hideHoverButtonTimeout = null;
  let pendingHoverTranslationText = null; // <<--- 첫 로드 시 보류된 번역 텍스트 저장
  let isIframeReady = false; // <<--- Iframe 준비 상태 플래그

  const chatIconUrl = 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/chat_bubble/default/24px.svg';
  const translateIconUrl = 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/translate/default/24px.svg';

  // PDF 페이지인지 확인하는 함수 (새로 추가)
  function isPdfPage() {
    // URL이 .pdf로 끝나는지 확인
    if (window.location.href.toLowerCase().endsWith('.pdf')) {
      return true;
    }

    // Chrome PDF 뷰어의 특정 요소가 있는지 확인
    if (document.querySelector('#viewerContainer') ||
      document.querySelector('.pdfViewer') ||
      document.querySelector('#viewer')) {
      return true;
    }

    return false;
  }

  // 현재 보이는 PDF 페이지의 텍스트 추출 (새로 추가)
  async function extractPdfPageContent() {
    try {
      // PDF 뷰어 컨테이너 찾기
      const viewerContainer = document.querySelector('#viewerContainer') ||
        document.querySelector('.pdfViewer') ||
        document.querySelector('#viewer');

      if (!viewerContainer) {
        console.warn("PDF 뷰어를 찾을 수 없습니다.");
        return "";
      }

      // 현재 보이는 페이지 찾기
      const visiblePages = Array.from(viewerContainer.querySelectorAll('.page'))
        .filter(page => {
          const rect = page.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        });

      if (!visiblePages.length) {
        console.warn("현재 보이는 PDF 페이지를 찾을 수 없습니다.");
        return "";
      }

      // 보이는 페이지들의 텍스트 레이어에서 텍스트 추출
      let pageTexts = [];
      for (const page of visiblePages) {
        const textLayer = page.querySelector('.textLayer');
        if (!textLayer) continue;

        const textElements = Array.from(textLayer.querySelectorAll('span'));
        const pageText = textElements.map(span => span.textContent).join(' ');
        if (pageText.trim()) {
          pageTexts.push(pageText);
        }
      }

      return pageTexts.join('\n\n');
    } catch (error) {
      console.error("PDF 텍스트 추출 중 오류:", error);
      return "";
    }
  }

  function createFab() {
    fabButton = document.createElement('div');
    fabButton.id = 'gemini-fab';
    fabButton.innerHTML = `<img src="${chatIconUrl}" alt="Chat">`;
    fabButton.addEventListener('click', toggleChatbot);
    document.body.appendChild(fabButton);
  }

  function createChatbotIframe() {
    if (chatbotIframe) { // 이미 있다면 재생성 방지
      return;
    }
    isIframeReady = false; // 새로 생성 시 준비 안됨 상태로
    chatbotIframe = document.createElement('iframe');
    chatbotIframe.id = 'gemini-chatbot-iframe';
    chatbotIframe.src = chrome.runtime.getURL('chatbot_ui/chatbot.html');
    chatbotIframe.setAttribute('allowfullscreen', ''); // 풀스크린 권한 추가
    document.body.appendChild(chatbotIframe);

    chatbotIframe.onload = () => { // <<--- Iframe 로드 완료 핸들러
      console.log("Chatbot iframe loaded and ready.");
      isIframeReady = true;
      // 보류된 번역 요청이 있는지 확인하고 처리
      if (pendingHoverTranslationText) {
        console.log("Processing pending hover translation.");
        sendTranslationRequestToChatbot(pendingHoverTranslationText);
        pendingHoverTranslationText = null; // 처리 후 초기화
      }
      // chatbot.js에 준비 완료 메시지를 보낼 필요는 이 구조에서는 없음.
      // 대신 chatbot.js가 로드 후 content.js에 메시지를 보내는 방식도 가능.
    };
  }

  function toggleChatbot() {
    let isNewlyCreated = false;
    if (!chatbotIframe) {
      createChatbotIframe();
      isNewlyCreated = true;
    }
    iframeVisible = !iframeVisible;
    if (iframeVisible) {
      chatbotIframe.classList.add('visible');
      if (fabButton) fabButton.style.display = 'none';
      hideHoverTranslateButton(); // 챗봇 열 때 호버 버튼 숨기기

      // iframe이 새로 생성된 경우에는 onload 이벤트에서 isIframeReady를 설정하도록 함
      // 이미 로드된 iframe인 경우에만 여기서 isIframeReady를 true로 설정
      if (!isNewlyCreated) {
        isIframeReady = true;

        // 보류된 번역 요청이 있으면 즉시 처리 (새로 생성된 경우 onload에서 처리됨)
        if (pendingHoverTranslationText) {
          console.log("Processing pending translation after toggling chatbot.");
          sendTranslationRequestToChatbot(pendingHoverTranslationText);
          pendingHoverTranslationText = null; // 처리 후 초기화
        }
      }
    } else {
      if (chatbotIframe) chatbotIframe.classList.remove('visible');
      if (fabButton) fabButton.style.display = 'flex';
      isIframeReady = false; // 닫힐 때 준비 안됨 상태로
      pendingHoverTranslationText = null; // 닫을 때 보류 중인 번역 텍스트 초기화
      // iframe을 DOM에서 제거하고 싶다면 여기서 제거 로직 추가
      // if (chatbotIframe) {
      //    chatbotIframe.remove();
      //    chatbotIframe = null;
      // }
    }
  }

  function createHoverTranslateButton() {
    if (!hoverTranslateButton) {
      hoverTranslateButton = document.createElement('button');
      hoverTranslateButton.id = 'selection-translate-hover-btn';
      hoverTranslateButton.innerHTML = `<img src="${translateIconUrl}" alt="Translate">`;
      hoverTranslateButton.addEventListener('click', handleHoverTranslateClick);
      document.body.appendChild(hoverTranslateButton);
    }
  }

  function showHoverTranslateButton(x, y) {
    if (!hoverTranslateButton) {
      createHoverTranslateButton();
    }
    hoverTranslateButton.style.left = `${x}px`;
    hoverTranslateButton.style.top = `${y}px`;
    hoverTranslateButton.style.display = 'flex';

    clearTimeout(hideHoverButtonTimeout);
    hideHoverButtonTimeout = setTimeout(hideHoverTranslateButton, 3000);
  }

  function hideHoverTranslateButton() {
    if (hoverTranslateButton) {
      hoverTranslateButton.style.display = 'none';
    }
    clearTimeout(hideHoverButtonTimeout);
  }

  // 챗봇 iframe으로 번역 요청 메시지를 보내는 함수 분리
  function sendTranslationRequestToChatbot(text) {
    if (chatbotIframe && chatbotIframe.contentWindow) {
      const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
      chatbotIframe.contentWindow.postMessage({
        type: "TRANSLATE_SELECTION_FROM_HOVER", // 동일한 메시지 타입 사용
        selectedText: text
      }, chatbotOrigin);
    } else {
      console.error("Cannot send message: Chatbot iframe not ready or not found.");
      // 사용자에게 오류 알림 또는 재시도 로직 추가 가능
    }
  }


  function handleHoverTranslateClick(event) {
    event.stopPropagation();
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText) {
      hideHoverTranslateButton();
      return;
    }

    if (!iframeVisible) {
      // 챗봇이 닫혀 있으면: 열고, 텍스트를 보류하고, iframe 로드 후 전송
      console.log("Hover click: iframe hidden. Opening and pending translation.");
      pendingHoverTranslationText = selectedText; // <<--- 텍스트 보류
      toggleChatbot(); // 챗봇 열기 (내부에서 createChatbotIframe 호출 및 onload 설정됨)
    } else if (isIframeReady) {
      // 챗봇이 열려 있고 준비되었으면: 바로 메시지 전송
      console.log("Hover click: iframe visible and ready. Sending translation request.");
      sendTranslationRequestToChatbot(selectedText); // <<--- 바로 전송
    } else {
      // 챗봇이 열리고 있지만 아직 로드 중이면: 텍스트 보류 (onload에서 처리됨)
      console.log("Hover click: iframe visible but not ready. Pending translation.");
      pendingHoverTranslationText = selectedText; // <<--- 텍스트 보류
    }

    hideHoverTranslateButton(); // 버튼 숨기기
  }

  // --- 이벤트 리스너들 ---
  document.addEventListener('mouseup', (event) => {
    if (hoverTranslateButton && hoverTranslateButton.contains(event.target)) {
      return;
    }
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection) return;
      const selectedText = selection.toString().trim();
      if (selectedText && !selection.isCollapsed && event.target.tagName !== 'IFRAME') {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const btnX = scrollX + rect.right + 5;
        const btnY = scrollY + rect.bottom + 5;
        showHoverTranslateButton(btnX, btnY);
      } else {
        if (!hoverTranslateButton || !hoverTranslateButton.contains(event.target)) {
          hideHoverTranslateButton();
        }
      }
    }, 50);
  });

  document.addEventListener('mousedown', (event) => {
    if (hoverTranslateButton && !hoverTranslateButton.contains(event.target)) {
      hideHoverTranslateButton();
    }
  });

  // 페이지 로드 시 초기화
  if (document.readyState === "complete" || document.readyState === "interactive") {
    if (!document.getElementById('gemini-fab')) { createFab(); }
    // 호버 버튼은 필요할 때 생성되도록 변경 (선택적 최적화)
    // createHoverTranslateButton();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (!document.getElementById('gemini-fab')) { createFab(); }
      // createHoverTranslateButton();
    });
  }

  // --- 메시지 핸들링 (from chatbot iframe) ---
  window.addEventListener("message", (event) => {
    if (!chatbotIframe || event.source !== chatbotIframe.contentWindow || !event.data) {
      return;
    }
    const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
    if (event.origin !== chatbotOrigin) return;

    if (event.data.type === "CLOSE_CHATBOT") {
      if (iframeVisible) toggleChatbot();
    } else if (event.data.type === "GET_PAGE_CONTENT") {
      extractPageContent().then(content => {
        chatbotIframe.contentWindow.postMessage({ type: "PAGE_CONTENT_RESULT", content: content, requestId: event.data.requestId }, chatbotOrigin);
      }).catch(error => {
        chatbotIframe.contentWindow.postMessage({ type: "PAGE_CONTENT_ERROR", error: error.message, requestId: event.data.requestId }, chatbotOrigin);
      });
    } else if (event.data.type === "GET_SELECTED_TEXT") {
      const selectedText = window.getSelection().toString().trim();
      chatbotIframe.contentWindow.postMessage({ type: "SELECTED_TEXT_RESULT", selectedText: selectedText, requestId: event.data.requestId }, chatbotOrigin);
    }
    // 챗봇으로부터 "준비 완료" 메시지를 받는 로직 (대안적 구현 시 필요)
    // else if (event.data.type === "CHATBOT_READY") {
    //   console.log("Received CHATBOT_READY from iframe.");
    //   isIframeReady = true;
    //   if (pendingHoverTranslationText) {
    //     sendTranslationRequestToChatbot(pendingHoverTranslationText);
    //     pendingHoverTranslationText = null;
    //   }
    // }
  });

  // --- 메시지 핸들링 (from background) ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (chatbotIframe && chatbotIframe.contentWindow && isIframeReady) { // <<--- iframe 준비 상태 확인 추가
      const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
      chatbotIframe.contentWindow.postMessage(request, chatbotOrigin);
    } else if (chatbotIframe && chatbotIframe.contentWindow && !isIframeReady) {
      // console.warn("Received message from background, but iframe is not ready. Message might be lost:", request);
      // 메시지를 큐에 넣었다가 ready 상태가 되면 보내는 로직 추가 가능
    }
    return false;
  });

  // 페이지 내용 추출 함수 (백그라운드 요청 + PDF 지원 추가)
  async function extractPageContent() {
    // PDF 페이지인 경우
    if (isPdfPage()) {
      console.log("PDF 페이지 감지됨: 내장 방식으로 텍스트 추출 시도");
      // 직접 PDF 텍스트 추출
      const pdfText = await extractPdfPageContent();
      if (pdfText) {
        console.log("PDF 페이지에서 텍스트 추출 성공");
        return pdfText;
      } else {
        console.warn("PDF 페이지에서 텍스트 추출 실패, 백그라운드 방식 시도");
      }
    }

    // PDF가 아니거나 PDF 텍스트 추출에 실패한 경우 기존 방식 사용
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "EXTRACT_PAGE_CONTENT_FROM_BG" }, response => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message to background:", chrome.runtime.lastError.message);
          return reject(chrome.runtime.lastError);
        }
        if (response && typeof response.content === 'string') {
          resolve(response.content);
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response?.content || "");
        }
      });
    });
  }
})();