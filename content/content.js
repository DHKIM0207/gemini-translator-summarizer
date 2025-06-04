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
    // URL로 PDF 확인
    if (window.location.href.toLowerCase().endsWith('.pdf')) {
      return true;
    }
    
    // Chrome PDF viewer의 embed 태그 확인
    const embedElement = document.querySelector('embed[type="application/pdf"]');
    if (embedElement) {
      return true;
    }
    
    // Chrome PDF viewer의 특정 클래스나 ID 확인
    if (document.querySelector('#viewerContainer') ||
      document.querySelector('.pdfViewer') ||
      document.querySelector('#viewer') ||
      document.querySelector('pdf-viewer')) {
      return true;
    }
    
    // Content-Type 확인 (meta 태그)
    const contentType = document.querySelector('meta[http-equiv="content-type"]');
    if (contentType && contentType.content.includes('application/pdf')) {
      return true;
    }
    
    return false;
  }

  async function extractPdfPageContent(currentPageOnly = false) {
    try {
      // Chrome의 최신 PDF 뷰어는 embed 태그를 사용
      const embedElement = document.querySelector('embed[type="application/pdf"]');
      
      if (embedElement) {
        // embed 태그가 있는 경우, 선택된 텍스트를 가져오는 방식 사용
        console.log("Chrome PDF 뷰어 감지 (embed 방식)");
        
        // 현재 선택된 텍스트가 있는지 확인
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          return selection.toString().trim();
        }
        
        // PDF에서 직접 텍스트를 추출할 수 없으므로 
        // 사용자에게 텍스트를 선택하도록 안내
        if (currentPageOnly) {
          return "[PDF 텍스트 추출 불가]\n\n현재 Chrome의 내장 PDF 뷰어에서는 자동으로 텍스트를 추출할 수 없습니다.\n\n번역하려는 텍스트를 마우스로 드래그하여 선택한 후 '선택 영역 번역' 버튼을 사용해주세요.";
        }
      }
      
      // 기존 방식 (다른 PDF 뷰어를 위한 폴백)
      const viewerContainer = document.querySelector('#viewerContainer') ||
        document.querySelector('.pdfViewer') ||
        document.querySelector('#viewer');

      if (!viewerContainer) {
        console.warn("PDF 뷰어를 찾을 수 없습니다.");
        
        // PDF 페이지인 경우 안내 메시지 반환
        if (isPdfPage()) {
          return "[PDF 텍스트 추출 불가]\n\n현재 페이지의 텍스트를 자동으로 추출할 수 없습니다.\n\n번역하려는 텍스트를 마우스로 드래그하여 선택한 후 '선택 영역 번역' 버튼을 사용해주세요.";
        }
        return "";
      }

      let pagesToExtract;
      
      if (currentPageOnly) {
        // 현재 페이지만 추출하는 경우 - 가장 많이 보이는 페이지를 찾음
        const allPages = Array.from(viewerContainer.querySelectorAll('.page'));
        let mostVisiblePage = null;
        let maxVisibleHeight = 0;
        
        allPages.forEach(page => {
          const rect = page.getBoundingClientRect();
          const viewportTop = 0;
          const viewportBottom = window.innerHeight;
          
          // 페이지가 뷰포트 내에 얼마나 보이는지 계산
          const visibleTop = Math.max(rect.top, viewportTop);
          const visibleBottom = Math.min(rect.bottom, viewportBottom);
          const visibleHeight = Math.max(0, visibleBottom - visibleTop);
          
          if (visibleHeight > maxVisibleHeight) {
            maxVisibleHeight = visibleHeight;
            mostVisiblePage = page;
          }
        });
        
        pagesToExtract = mostVisiblePage ? [mostVisiblePage] : [];
      } else {
        // 기존 로직: 보이는 모든 페이지 추출
        pagesToExtract = Array.from(viewerContainer.querySelectorAll('.page'))
          .filter(page => {
            const rect = page.getBoundingClientRect();
            return rect.top < window.innerHeight && rect.bottom > 0;
          });
      }

      if (!pagesToExtract.length) {
        console.warn("추출할 PDF 페이지를 찾을 수 없습니다.");
        return "";
      }

      let pageTexts = [];
      for (const page of pagesToExtract) {
        const textLayer = page.querySelector('.textLayer');
        if (!textLayer) continue;

        const textElements = Array.from(textLayer.querySelectorAll('span'));
        const pageText = textElements.map(span => span.textContent).join(' ');
        if (pageText.trim()) {
          // 현재 페이지 번호 가져오기 (디버깅용)
          const pageNumber = page.getAttribute('data-page-number');
          if (currentPageOnly && pageNumber) {
            console.log(`PDF 현재 페이지 번호: ${pageNumber}`);
          }
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
      hoverTranslateButton.innerHTML = '<span style="color: white !important; font-size: 24px; line-height: 1; font-family: \'Material Symbols Outlined\'; font-weight: normal; font-style: normal; display: inline-block;">language_korean_latin</span>';
      
      // Material Symbols Outlined 폰트 추가 (스타일 태그로)
      if (!document.querySelector('#material-symbols-style')) {
        const style = document.createElement('style');
        style.id = 'material-symbols-style';
        style.textContent = `
          @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0');
          
          #selection-translate-hover-btn span {
            font-family: 'Material Symbols Outlined' !important;
            font-weight: normal;
            font-style: normal;
            font-size: 24px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
          }
        `;
        document.head.appendChild(style);
      }
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

    // 타이머 설정하지 않음 - 드래그 중에는 사라지지 않도록
    clearTimeout(hideHoverButtonTimeout);
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
    
    let selectedText = "";
    try {
      // PDF에서도 작동하도록 개선된 텍스트 선택 로직
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        selectedText = selection.toString();
      }
      
      // PDF embed 요소가 있고 텍스트가 없는 경우
      if (!selectedText && document.querySelector('embed[type="application/pdf"]')) {
        const docSelection = document.getSelection();
        if (docSelection && docSelection.rangeCount > 0) {
          selectedText = docSelection.toString();
        }
      }
    } catch (error) {
      console.error("호버 번역: 텍스트 선택 중 오류:", error);
    }
    
    selectedText = selectedText.trim();
    console.log("호버 번역 선택된 텍스트:", selectedText);
    
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
        const btnX = scrollX + rect.left + (rect.width / 2) - 21;
        const btnY = scrollY + rect.bottom + 5;
        showHoverTranslateButton(btnX, btnY);
      } else {
        if (!hoverTranslateButton || !hoverTranslateButton.contains(event.target)) {
          hideHoverTranslateButton();
        }
      }
    }, 50);
  });

  // 선택 영역이 변경되면 버튼 숨기기
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      hideHoverTranslateButton();
    }
  });

  // 클릭 시 선택 영역이 해제되면 버튼 숨기기
  document.addEventListener('click', (event) => {
    if (hoverTranslateButton && hoverTranslateButton.contains(event.target)) {
      return;
    }
    
    // 잠시 후 선택 영역 확인
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        hideHoverTranslateButton();
      }
    }, 100);
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
      let selectedText = "";
      
      try {
        // 기본 방식: window.getSelection() 사용
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selectedText = selection.toString();
          console.log("선택된 텍스트 (getSelection):", selectedText);
        }
        
        // PDF embed 요소가 있는 경우 추가 확인
        const embedElement = document.querySelector('embed[type="application/pdf"]');
        if (embedElement && !selectedText) {
          // embed 요소가 있을 때 document.getSelection() 시도
          const docSelection = document.getSelection();
          if (docSelection && docSelection.rangeCount > 0) {
            selectedText = docSelection.toString();
            console.log("선택된 텍스트 (document.getSelection):", selectedText);
          }
        }
        
        // 여전히 텍스트가 없으면 activeElement 확인
        if (!selectedText && document.activeElement) {
          const activeSelection = document.activeElement.contentDocument?.getSelection?.();
          if (activeSelection) {
            selectedText = activeSelection.toString();
            console.log("선택된 텍스트 (activeElement):", selectedText);
          }
        }
      } catch (error) {
        console.error("텍스트 선택 중 오류:", error);
      }
      
      console.log("최종 선택된 텍스트:", selectedText);
      chatbotIframe.contentWindow.postMessage({ 
        type: "SELECTED_TEXT_RESULT", 
        selectedText: selectedText.trim(), 
        requestId: event.data.requestId 
      }, chatbotOrigin);
    } else if (event.data.type === "CHECK_IS_PDF") {
      // PDF 페이지인지 확인
      chatbotIframe.contentWindow.postMessage({ 
        type: "IS_PDF_RESULT", 
        isPdf: isPdfPage(), 
        requestId: event.data.requestId 
      }, chatbotOrigin);
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