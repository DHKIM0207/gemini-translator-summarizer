(function () {
  let fabButton = null;
  let chatbotIframe = null;
  let iframeVisible = false;
  let hoverTranslateButton = null;
  let hideHoverButtonTimeout = null;
  let pendingHoverTranslationText = null;
  let isIframeReady = false;

  const chatIconUrl = 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/chat_bubble/default/24px.svg';
  const translateIconUrl = 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/translate/default/24px.svg';

  function isPdfPage() {
    if (window.location.href.toLowerCase().endsWith('.pdf')) {
      return true;
    }
    if (document.querySelector('#viewerContainer') ||
      document.querySelector('.pdfViewer') ||
      document.querySelector('#viewer')) {
      return true;
    }
    return false;
  }

  async function extractPdfPageContent() {
    try {
      const viewerContainer = document.querySelector('#viewerContainer') ||
        document.querySelector('.pdfViewer') ||
        document.querySelector('#viewer');

      if (!viewerContainer) {
        console.warn("PDF 뷰어를 찾을 수 없습니다.");
        return "";
      }

      const visiblePages = Array.from(viewerContainer.querySelectorAll('.page'))
        .filter(page => {
          const rect = page.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        });

      if (!visiblePages.length) {
        console.warn("현재 보이는 PDF 페이지를 찾을 수 없습니다.");
        return "";
      }

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
    if (chatbotIframe) {
      return;
    }
    isIframeReady = false;
    chatbotIframe = document.createElement('iframe');
    chatbotIframe.id = 'gemini-chatbot-iframe';
    chatbotIframe.src = chrome.runtime.getURL('chatbot_ui/chatbot.html');
    chatbotIframe.setAttribute('allowfullscreen', '');
    chatbotIframe.setAttribute('allow', 'clipboard-write'); // 클립보드 쓰기 권한 추가
    document.body.appendChild(chatbotIframe);

    chatbotIframe.onload = () => {
      console.log("Chatbot iframe loaded and ready.");
      isIframeReady = true;
      if (pendingHoverTranslationText) {
        console.log("Processing pending hover translation.");
        sendTranslationRequestToChatbot(pendingHoverTranslationText);
        pendingHoverTranslationText = null;
      }
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
      hideHoverTranslateButton();

      if (!isNewlyCreated) {
        isIframeReady = true;
        if (pendingHoverTranslationText) {
          console.log("Processing pending translation after toggling chatbot.");
          sendTranslationRequestToChatbot(pendingHoverTranslationText);
          pendingHoverTranslationText = null;
        }
      }
    } else {
      if (chatbotIframe) chatbotIframe.classList.remove('visible');
      if (fabButton) fabButton.style.display = 'flex';
      isIframeReady = false;
      pendingHoverTranslationText = null;
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

  function sendTranslationRequestToChatbot(text) {
    if (chatbotIframe && chatbotIframe.contentWindow) {
      const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
      chatbotIframe.contentWindow.postMessage({
        type: "TRANSLATE_SELECTION_FROM_HOVER",
        selectedText: text
      }, chatbotOrigin);
    } else {
      console.error("Cannot send message: Chatbot iframe not ready or not found.");
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
      console.log("Hover click: iframe hidden. Opening and pending translation.");
      pendingHoverTranslationText = selectedText;
      toggleChatbot();
    } else if (isIframeReady) {
      console.log("Hover click: iframe visible and ready. Sending translation request.");
      sendTranslationRequestToChatbot(selectedText);
    } else {
      console.log("Hover click: iframe visible but not ready. Pending translation.");
      pendingHoverTranslationText = selectedText;
    }
    hideHoverTranslateButton();
  }

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

  if (document.readyState === "complete" || document.readyState === "interactive") {
    if (!document.getElementById('gemini-fab')) { createFab(); }
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (!document.getElementById('gemini-fab')) { createFab(); }
    });
  }

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
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (chatbotIframe && chatbotIframe.contentWindow && isIframeReady) {
      const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
      chatbotIframe.contentWindow.postMessage(request, chatbotOrigin);
    } else if (chatbotIframe && chatbotIframe.contentWindow && !isIframeReady) {
      // console.warn("Received message from background, but iframe is not ready. Message might be lost:", request);
    }
    return false; // 비동기 응답이 아니므로 false 또는 undefined 반환
  });

  async function extractPageContent() {
    if (isPdfPage()) {
      console.log("PDF 페이지 감지됨: 내장 방식으로 텍스트 추출 시도");
      const pdfText = await extractPdfPageContent();
      if (pdfText) {
        console.log("PDF 페이지에서 텍스트 추출 성공");
        return pdfText;
      } else {
        console.warn("PDF 페이지에서 텍스트 추출 실패, 백그라운드 방식 시도");
      }
    }

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
          // response가 undefined이거나 content가 없는 경우 빈 문자열로 처리
          resolve(response?.content || "");
        }
      });
    });
  }
})();