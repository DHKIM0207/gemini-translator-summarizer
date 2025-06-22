// PDF.js 설정
if (typeof pdfjsLib === 'undefined') {
  console.error('PDF.js 라이브러리가 로드되지 않았습니다.');
} else {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';
  console.log('PDF.js 라이브러리 로드 완료, 버전:', pdfjsLib.version);
}

let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.0;
let rotation = 0; // 회전 각도 (0, 90, 180, 270)
let pageViewMode = 'continuous'; // 'continuous', 'single' 또는 'double'
let fitMode = 'none'; // 'width' 또는 'none'
// Canvas elements will be created dynamically for continuous mode

// UI 요소들
// const prevButton = document.getElementById('prev-page'); // 버튼 제거됨
// const nextButton = document.getElementById('next-page'); // 버튼 제거됨
const pageNumInput = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const zoomInButton = document.getElementById('zoom-in');
const zoomOutButton = document.getElementById('zoom-out');
const zoomLevelSpan = document.getElementById('zoom-level');
const fitPageButton = document.getElementById('fit-page');
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
// const pdfTitle = document.getElementById('pdf-title'); // 요소 제거됨
// FAB button removed - using sidebar instead

// URL에서 PDF 파일 경로 가져오기
function getPdfUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('file') || params.get('url');
}

// 파일 URL 접근 권한 체크
async function checkFileAccessPermission(url) {
  // file:// URL인지 확인
  if (url && url.startsWith('file://')) {
    try {
      // chrome.extension.isAllowedFileSchemeAccess API를 사용하여 권한 확인
      const hasAccess = await new Promise((resolve) => {
        chrome.extension.isAllowedFileSchemeAccess(resolve);
      });
      
      if (!hasAccess) {
        // 권한이 없으면 팝업 표시
        showFileAccessPopup();
        return false;
      }
    } catch (error) {
      console.error('파일 접근 권한 확인 오류:', error);
    }
  }
  return true;
}

// 파일 접근 권한 팝업 표시
function showFileAccessPopup() {
  const popup = document.getElementById('file-access-popup');
  const popupTitle = document.getElementById('popup-title');
  const popupMessage = document.getElementById('popup-message');
  const openSettingsText = document.getElementById('open-settings-text');
  const closeText = document.getElementById('close-text');
  
  // i18n 메시지 설정
  popupTitle.textContent = chrome.i18n.getMessage('fileAccessPermissionTitle');
  popupMessage.textContent = chrome.i18n.getMessage('fileAccessPermissionMessage');
  openSettingsText.textContent = chrome.i18n.getMessage('openSettings');
  closeText.textContent = chrome.i18n.getMessage('close');
  
  popup.classList.remove('hidden');
  
  // 설정 열기 버튼 이벤트
  document.getElementById('open-settings-btn').addEventListener('click', () => {
    chrome.tabs.create({
      url: `chrome://extensions/?id=${chrome.runtime.id}`
    });
  });
  
  // 닫기 버튼 이벤트
  document.getElementById('close-popup-btn').addEventListener('click', () => {
    popup.classList.add('hidden');
  });
}

// PDF 문서 로드
async function loadPdf(url) {
  try {
    // 파일 접근 권한 체크
    const hasPermission = await checkFileAccessPermission(url);
    if (!hasPermission) {
      loadingIndicator.classList.add('hidden');
      return;
    }
    
    loadingIndicator.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    
    console.log('PDF 로드 시작:', url);
    
    // PDF 로드 옵션 설정
    const loadingTask = pdfjsLib.getDocument({
      url: url,
      disableRange: false,
      disableStream: false
    });
    
    pdfDoc = await loadingTask.promise;
    window.pdfDoc = pdfDoc; // 전역으로 노출
    console.log('PDF 문서 로드 완료, 페이지 수:', pdfDoc.numPages);
    
    pageCountSpan.textContent = pdfDoc.numPages;
    pageNumInput.max = pdfDoc.numPages;
    
    // 문서 제목 설정
    const info = await pdfDoc.getMetadata();
    if (info.info && info.info.Title) {
      // pdfTitle.textContent = info.info.Title; // 요소 제거됨
      document.title = `${info.info.Title} - PDF 뷰어`;
    } else {
      const filename = url.split('/').pop().split('?')[0];
      // pdfTitle.textContent = decodeURIComponent(filename); // 요소 제거됨
      document.title = `${decodeURIComponent(filename)} - PDF 뷰어`;
    }
    
    // 초기 실제 크기(100%) 설정
    scale = 1.0;
    zoomLevelSpan.textContent = '100%';
    
    if (pageViewMode === 'continuous') {
      // Continuous mode: create all page containers
      await window.continuousScroll.createAllPageContainers();
      
      // Hide loading indicator
      loadingIndicator.classList.add('hidden');
      
      // Simple initialization
      const pdfRenderContainer = document.getElementById('pdf-render-container');
      if (pdfRenderContainer) {
        // Ensure we start at the top
        pdfRenderContainer.scrollTop = 0;
        
        // Set initial page
        pageNum = 1;
        pageNumInput.value = 1;
        
        // Check visible pages immediately
        window.continuousScroll.checkVisiblePages();
      }
    } else {
      // 첫 페이지 렌더링
      renderPage(pageNum);
    }
    
  } catch (error) {
    console.error('PDF 로드 오류:', error);
    loadingIndicator.classList.add('hidden');
    errorMessage.classList.remove('hidden');
    errorText.textContent = `PDF를 불러올 수 없습니다: ${error.message}`;
  }
}

// 페이지 렌더링
async function renderPage(num) {
  if (pageViewMode === 'continuous') {
    // Continuous mode: scroll to page
    window.continuousScroll.scrollToPage(num);
    pageNum = num;
    pageNumInput.value = num;
  } else {
    // Single/Double page mode (existing code)
    pageRendering = true;
    console.log(`페이지 ${num} 렌더링 시작`);
    
    try {
      // TODO: Implement single/double page rendering
      console.log('Single/Double page mode not yet implemented');
    } catch (error) {
      console.error('페이지 렌더링 오류:', error);
    } finally {
      pageRendering = false;
      
      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    }
  }
}

// 단일 페이지 렌더링
async function renderSinglePage(pageNumber, targetCanvas, targetCtx, targetTextLayer) {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: scale, rotation: rotation });
    console.log('Viewport:', viewport.width, 'x', viewport.height);
    
    targetCanvas.height = viewport.height;
    targetCanvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: targetCtx,
      viewport: viewport
    };
    
    const renderTask = page.render(renderContext);
    await renderTask.promise;
    
    // 텍스트 레이어 렌더링
    targetTextLayer.innerHTML = '';
    targetTextLayer.style.width = viewport.width + 'px';
    targetTextLayer.style.height = viewport.height + 'px';
    
    // 텍스트 레이어는 절대 위치로 캔버스 위에 배치됨
    targetTextLayer.style.left = '0';
    targetTextLayer.style.top = '0';
    
    const textContent = await page.getTextContent();
    
    // PDF.js의 새로운 TextLayer API 사용 시도
    if (pdfjsLib.TextLayer) {
      console.log('새로운 TextLayer API 사용');
      const textLayerInstance = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: targetTextLayer,
        viewport: viewport
      });
      await textLayerInstance.render();
    } else {
      console.log('기존 renderTextLayer API 사용');
      const textLayerRenderTask = pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: targetTextLayer,
        viewport: viewport,
        textDivs: []
      });
      await textLayerRenderTask.promise;
    }
    
    // 텍스트 선택 가능하도록 설정
    targetTextLayer.style.pointerEvents = 'auto';
    targetTextLayer.style.userSelect = 'text';
    targetTextLayer.style.cursor = 'text';
    
    // 텍스트 레이어의 각 span 요소에도 스타일 적용
    const textSpans = targetTextLayer.querySelectorAll('span');
    textSpans.forEach(span => {
      span.style.userSelect = 'text';
      span.style.cursor = 'text';
    });
    
    console.log('텍스트 레이어 렌더링 완료, span 개수:', textSpans.length);
    
    // 텍스트 선택 테스트
    setTimeout(() => {
      const testSelection = window.getSelection();
      console.log('선택 가능 테스트:', testSelection.toString());
    }, 100);
    
    loadingIndicator.classList.add('hidden');
  } catch (error) {
    console.error(`페이지 ${pageNumber} 렌더링 오류:`, error);
    loadingIndicator.classList.add('hidden');
  }
}

// 페이지 이동
function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    renderPage(num);
  }
}

function onPrevPage() {
  if (pageNum <= 1) return;
  
  if (pageViewMode === 'double') {
    // 더블 페이지 모드에서는 2페이지씩 이동
    pageNum = Math.max(1, pageNum - 2);
  } else {
    pageNum--;
  }
  
  pageNumInput.value = pageNum;
  
  if (pageViewMode === 'continuous') {
    window.continuousScroll.scrollToPage(pageNum);
  } else {
    queueRenderPage(pageNum);
  }
}

function onNextPage() {
  if (pageNum >= pdfDoc.numPages) return;
  
  if (pageViewMode === 'double') {
    // 더블 페이지 모드에서는 2페이지씩 이동
    pageNum = Math.min(pdfDoc.numPages, pageNum + 2);
  } else {
    pageNum++;
  }
  
  pageNumInput.value = pageNum;
  
  if (pageViewMode === 'continuous') {
    window.continuousScroll.scrollToPage(pageNum);
  } else {
    queueRenderPage(pageNum);
  }
}

// 줌 기능
function zoomIn() {
  scale = Math.min(scale * 1.2, 3.0);
  zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
  
  // 수동 줌 시 현재 상태가 너비 맞춤이면 해제
  if (fitMode === 'width') {
    fitMode = 'none';
    fitPageButton.title = chrome.i18n.getMessage('pdfViewerFitWidth');
    fitPageButton.querySelector('.material-symbols-outlined').textContent = 'fit_page_width';
  }
  
  if (pageViewMode === 'continuous') {
    window.continuousScroll.rerenderAllPages();
  } else {
    queueRenderPage(pageNum);
  }
}

function zoomOut() {
  scale = Math.max(scale / 1.2, 0.5);
  zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
  
  // 수동 줌 시 현재 상태가 너비 맿춤이면 해제
  if (fitMode === 'width') {
    fitMode = 'none';
    fitPageButton.title = chrome.i18n.getMessage('pdfViewerFitWidth');
    fitPageButton.querySelector('.material-symbols-outlined').textContent = 'fit_page_width';
  }
  
  if (pageViewMode === 'continuous') {
    window.continuousScroll.rerenderAllPages();
  } else {
    queueRenderPage(pageNum);
  }
}

function fitPage() {
  // 토글: none (실제 크기) <-> width (너비에 맞추기)
  const container = document.getElementById('pdf-render-container');
  const chatbotWidth = parseInt(window.getComputedStyle(document.getElementById('chatbot-sidebar')).width, 10);
  const containerWidth = window.innerWidth - chatbotWidth - 40; // chatbot sidebar and padding
  
  pdfDoc.getPage(pageNum).then(page => {
    const viewport = page.getViewport({ scale: 1.0, rotation: rotation });
    
    if (fitMode === 'none') {
      // 실제 크기에서 너비에 맞추기로 전환
      fitMode = 'width';
      let targetWidth = containerWidth;
      if (pageViewMode === 'double') {
        targetWidth = (containerWidth - 20) / 2; // gap 고려
      }
      scale = targetWidth / viewport.width;
      fitPageButton.title = chrome.i18n.getMessage('pdfViewerActualSize');
      fitPageButton.querySelector('.material-symbols-outlined').textContent = 'fit_screen';
    } else {
      // 너비에 맞추기에서 실제 크기로 전환
      fitMode = 'none';
      scale = 1.0;
      fitPageButton.title = chrome.i18n.getMessage('pdfViewerFitWidth');
      fitPageButton.querySelector('.material-symbols-outlined').textContent = 'fit_page_width';
    }
    
    zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
    
    if (pageViewMode === 'continuous') {
      window.continuousScroll.rerenderAllPages();
    } else {
      queueRenderPage(pageNum);
    }
  });
}

// 이벤트 리스너
// prevButton.addEventListener('click', onPrevPage); // 버튼 제거됨
// nextButton.addEventListener('click', onNextPage); // 버튼 제거됨
zoomInButton.addEventListener('click', zoomIn);
zoomOutButton.addEventListener('click', zoomOut);
fitPageButton.addEventListener('click', fitPage);

pageNumInput.addEventListener('change', () => {
  const num = parseInt(pageNumInput.value);
  if (num >= 1 && num <= pdfDoc.numPages) {
    pageNum = num;
    if (pageViewMode === 'continuous') {
      window.continuousScroll.scrollToPage(num);
    } else {
      queueRenderPage(pageNum);
    }
  } else {
    pageNumInput.value = pageNum;
  }
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
  switch(e.key) {
    case 'ArrowLeft':
      onPrevPage();
      break;
    case 'ArrowRight':
      onNextPage();
      break;
    case '+':
    case '=':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomIn();
      }
      break;
    case '-':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomOut();
      }
      break;
  }
});

// 마우스휠 이벤트 처리
document.addEventListener('wheel', (e) => {
  // PDF 렌더 컨테이너 영역에서만 동작
  const pdfRenderContainer = document.getElementById('pdf-render-container');
  if (!pdfRenderContainer.contains(e.target)) return;
  
  if (e.ctrlKey || e.metaKey) {
    // Ctrl/Cmd + 휠로 줌
    e.preventDefault();
    
    // deltaY가 음수면 위로 스크롤 (확대), 양수면 아래로 스크롤 (축소)
    if (e.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  } else {
    // 일반 스크롤로 페이지 이동
    const scrollContainer = pdfRenderContainer;
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    
    // 스크롤이 맨 위에 있고 위로 스크롤하면 이전 페이지
    if (scrollTop === 0 && e.deltaY < 0) {
      e.preventDefault();
      onPrevPage();
    }
    // 스크롤이 맨 아래에 있고 아래로 스크롤하면 다음 페이지
    else if (scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0) {
      e.preventDefault();
      onNextPage();
    }
  }
}, { passive: false });

// 챗봇 iframe 관련 변수
let chatbotIframe = null;
let chatbotSidebar = null;
let isResizing = false;
let startX = 0;
let startWidth = 0;

// 챗봇 iframe 초기화 함수
function initializeChatbotIframe() {
  chatbotIframe = document.getElementById('gemini-chatbot-iframe');
  chatbotSidebar = document.getElementById('chatbot-sidebar');
  if (chatbotIframe) {
    chatbotIframe.src = chrome.runtime.getURL('chatbot_ui/chatbot.html');
    chatbotIframe.setAttribute('allowfullscreen', '');
    chatbotIframe.setAttribute('allow', 'clipboard-write');
    
    // iframe 로드 후 close 버튼 숨기기
    chatbotIframe.onload = function() {
      setTimeout(() => {
        // PDF 뷰어에서는 close 버튼 숨기기 메시지 전송
        const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
        chatbotIframe.contentWindow.postMessage({
          type: 'HIDE_CLOSE_BUTTON',
          isPdfViewer: true
        }, chatbotOrigin);
      }, 500);
    };
  }
  
  // 리사이즈 기능 초기화
  if (chatbotSidebar) {
    initializeSidebarResize();
  }
}

// 사이드바 리사이즈 기능
function initializeSidebarResize() {
  const resizeHandle = chatbotSidebar;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    // 리사이즈 핸들 영역 (왼쪽 5px)에서만 동작
    const rect = resizeHandle.getBoundingClientRect();
    if (e.clientX > rect.left + 5) return;
    
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(window.getComputedStyle(chatbotSidebar).width, 10);
    
    // iframe의 포인터 이벤트 비활성화
    chatbotIframe.style.pointerEvents = 'none';
    document.body.style.cursor = 'ew-resize';
    
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const width = startWidth - (e.clientX - startX);
    const maxWidth = window.innerWidth * 0.5; // 50% of screen width
    if (width >= 300 && width <= maxWidth) {
      chatbotSidebar.style.width = width + 'px';
      // PDF 콘텐츠 영역 조정
      const pdfRenderContainer = document.getElementById('pdf-render-container');
      if (pdfRenderContainer) {
        pdfRenderContainer.style.right = width + 'px';
      }
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      // iframe의 포인터 이벤트 복원
      chatbotIframe.style.pointerEvents = '';
      document.body.style.cursor = '';
      
      // 너비 저장
      const currentWidth = parseInt(window.getComputedStyle(chatbotSidebar).width, 10);
      chrome.storage.local.set({ pdfChatbotWidth: currentWidth });
    }
  });
  
  // 저장된 너비 복원
  chrome.storage.local.get(['pdfChatbotWidth'], (result) => {
    if (result.pdfChatbotWidth) {
      chatbotSidebar.style.width = result.pdfChatbotWidth + 'px';
      const pdfRenderContainer = document.getElementById('pdf-render-container');
      if (pdfRenderContainer) {
        pdfRenderContainer.style.right = result.pdfChatbotWidth + 'px';
      }
    }
  });
}

// DOMContentLoaded 이벤트 처리
window.addEventListener('DOMContentLoaded', () => {
  console.log('PDF 뷰어 준비 완료');
  initializeChatbotIframe();
});


// 챗봇과의 메시지 통신
window.addEventListener("message", (event) => {
  if (!chatbotIframe || event.source !== chatbotIframe.contentWindow) return;
  
  const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
  if (event.origin !== chatbotOrigin) return;
  
  if (event.data.type === "GET_SELECTED_TEXT") {
    const selectedText = getSelectedText();
    chatbotIframe.contentWindow.postMessage({
      type: "SELECTED_TEXT_RESULT",
      selectedText: selectedText,
      requestId: event.data.requestId
    }, chatbotOrigin);
  } else if (event.data.type === "GET_PAGE_CONTENT") {
    // PDF 현재 페이지의 텍스트 내용 가져오기
    const textContent = textLayer.textContent || '';
    chatbotIframe.contentWindow.postMessage({
      type: "PAGE_CONTENT_RESULT",
      content: textContent,
      requestId: event.data.requestId
    }, chatbotOrigin);
  }
});

// 선택 영역 툴바 관련 변수
let selectionToolbar = null;
let hideToolbarTimeout = null;

// 선택 영역 툴바 생성
function createSelectionToolbar() {
  if (!selectionToolbar) {
    selectionToolbar = document.createElement('div');
    selectionToolbar.id = 'selection-toolbar';
    selectionToolbar.style.cssText = `
      position: fixed;
      display: none;
      background-color: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 4px;
      z-index: 10000;
      gap: 4px;
      flex-direction: row;
      align-items: center;
    `;
    
    // 번역 버튼
    const translateBtn = document.createElement('button');
    translateBtn.id = 'toolbar-translate-btn';
    translateBtn.setAttribute('data-tooltip', chrome.i18n.getMessage('translateTooltip') || '번역');
    translateBtn.style.cssText = `
      background-color: transparent;
      color: #374151;
      border: none;
      border-radius: 6px;
      width: 36px;
      height: 36px;
      padding: 0;
      cursor: pointer;
      transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    `;
    translateBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 20px !important; line-height: 1;">translate</span>';
    translateBtn.addEventListener('click', handleTranslateClick);
    translateBtn.addEventListener('mouseenter', () => {
      translateBtn.style.backgroundColor = '#f3f4f6';
      translateBtn.style.color = '#3b82f6';
    });
    translateBtn.addEventListener('mouseleave', () => {
      translateBtn.style.backgroundColor = 'transparent';
      translateBtn.style.color = '#374151';
    });
    
    // 검색 버튼
    const searchBtn = document.createElement('button');
    searchBtn.id = 'toolbar-search-btn';
    searchBtn.setAttribute('data-tooltip', chrome.i18n.getMessage('searchTooltip') || '검색');
    searchBtn.style.cssText = translateBtn.style.cssText;
    searchBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 20px !important; line-height: 1;">search</span>';
    searchBtn.addEventListener('click', handleSearchClick);
    searchBtn.addEventListener('mouseenter', () => {
      searchBtn.style.backgroundColor = '#f3f4f6';
      searchBtn.style.color = '#3b82f6';
    });
    searchBtn.addEventListener('mouseleave', () => {
      searchBtn.style.backgroundColor = 'transparent';
      searchBtn.style.color = '#374151';
    });
    
    selectionToolbar.appendChild(translateBtn);
    selectionToolbar.appendChild(searchBtn);
    document.body.appendChild(selectionToolbar);
  }
}

// 선택 영역 툴바 표시
function showSelectionToolbar(x, y) {
  if (!selectionToolbar) {
    createSelectionToolbar();
  }
  selectionToolbar.style.left = `${x}px`;
  selectionToolbar.style.top = `${y}px`;
  selectionToolbar.style.display = 'flex';
  
  clearTimeout(hideToolbarTimeout);
}

// 선택 영역 툴바 숨기기
function hideSelectionToolbar() {
  if (selectionToolbar) {
    selectionToolbar.style.display = 'none';
  }
  clearTimeout(hideToolbarTimeout);
}

// 선택된 텍스트 가져오기
function getSelectedText() {
  return window.getSelection().toString().trim();
}

// 번역 버튼 클릭 처리
function handleTranslateClick(event) {
  event.stopPropagation();
  const selectedText = getSelectedText();
  if (!selectedText) {
    hideSelectionToolbar();
    return;
  }
  
  // 챗봇은 항상 열려있음 (사이드패널)
  
  // 선택된 텍스트 번역 요청 전송
  setTimeout(() => {
    if (chatbotIframe && chatbotIframe.contentWindow) {
      const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
      chatbotIframe.contentWindow.postMessage({
        type: "TRANSLATE_SELECTION_FROM_HOVER",
        selectedText: selectedText
      }, chatbotOrigin);
    }
  }, 100);
  
  hideSelectionToolbar();
}

// 검색 버튼 클릭 처리
function handleSearchClick(event) {
  event.stopPropagation();
  const selectedText = getSelectedText();
  if (!selectedText) {
    hideSelectionToolbar();
    return;
  }
  
  // 챗봇은 항상 열려있음 (사이드패널)
  
  // 선택된 텍스트 검색 요청 전송
  setTimeout(() => {
    if (chatbotIframe && chatbotIframe.contentWindow) {
      const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
      chatbotIframe.contentWindow.postMessage({
        type: "SEARCH_FROM_HOVER",
        searchText: selectedText
      }, chatbotOrigin);
    }
  }, 100);
  
  hideSelectionToolbar();
}

// 마우스 이벤트 리스너 추가
document.addEventListener('mouseup', (event) => {
  if (selectionToolbar && selectionToolbar.contains(event.target)) {
    return;
  }
  
  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection) return;
    
    const selectedText = selection.toString().trim();
    if (selectedText && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      
      const toolbarX = window.scrollX + rect.left + (rect.width / 2) - 40;
      const toolbarY = window.scrollY + rect.bottom + 5;
      showSelectionToolbar(toolbarX, toolbarY);
    }
  }, 50);
});

// 선택 영역이 변경되면 툴바 숨기기
document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    hideSelectionToolbar();
  }
});

// 클릭 시 선택 영역이 해제되면 툴바 숨기기
document.addEventListener('click', (event) => {
  if (selectionToolbar && selectionToolbar.contains(event.target)) {
    return;
  }
  
  // 잠시 후 선택 영역 확인
  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      hideSelectionToolbar();
    }
  }, 100);
});

// 선택된 텍스트 가져오기
function getSelectedText() {
  const selection = window.getSelection();
  return selection.toString().trim();
}

// Chrome 확장 프로그램과 통신
if (chrome && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_SELECTED_TEXT') {
      sendResponse({ selectedText: getSelectedText() });
    } else if (request.type === 'GET_PAGE_CONTENT') {
      // 현재 페이지의 전체 텍스트 가져오기
      const textContent = textLayer.textContent || '';
      sendResponse({ content: textContent });
    }
    return true;
  });
}

// 특정 페이지의 텍스트 내용 가져오기
async function getPageTextContent(pageNumber) {
  if (!pdfDoc || pageNumber < 1 || pageNumber > pdfDoc.numPages) {
    throw new Error(`잘못된 페이지 번호: ${pageNumber}`);
  }
  
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const textItems = textContent.items;
    
    // 텍스트 아이템들을 하나의 문자열로 결합
    let pageText = '';
    for (let i = 0; i < textItems.length; i++) {
      const item = textItems[i];
      pageText += item.str;
      
      // 다음 아이템과의 간격을 확인하여 공백 추가
      if (i < textItems.length - 1) {
        const nextItem = textItems[i + 1];
        // Y 좌표가 다르면 줄바꿈
        if (Math.abs(item.transform[5] - nextItem.transform[5]) > 5) {
          pageText += '\n';
        } else {
          pageText += ' ';
        }
      }
    }
    
    return pageText;
  } catch (error) {
    console.error(`페이지 ${pageNumber} 텍스트 추출 오류:`, error);
    throw error;
  }
}

// 챗봇 iframe과의 메시지 통신
window.addEventListener('message', async (event) => {
  // 챗봇 iframe에서 온 메시지인지 확인
  if (!event.data || !event.data.type) return;
  
  const { type, requestId } = event.data;
  
  if (type === 'CHECK_IS_PDF_VIEWER') {
    // PDF 뷰어 페이지임을 알림
    event.source.postMessage({
      type: 'IS_PDF_VIEWER_RESULT',
      isPdfViewer: true,
      currentPage: pageNum,  // 현재 페이지 번호 포함
      totalPages: pdfDoc ? pdfDoc.numPages : 0,
      requestId: requestId
    }, event.origin);
  } else if (type === 'GET_PDF_PAGE_CONTENT') {
    // 특정 페이지의 내용 요청
    const pageNumber = event.data.pageNumber;
    
    try {
      const content = await getPageTextContent(pageNumber);
      event.source.postMessage({
        type: 'PDF_PAGE_CONTENT_RESULT',
        content: content,
        requestId: requestId
      }, event.origin);
    } catch (error) {
      event.source.postMessage({
        type: 'PDF_PAGE_CONTENT_ERROR',
        error: error.message,
        requestId: requestId
      }, event.origin);
    }
  }
});

// 새로운 버튼 요소들
const toggleOutlineButton = document.getElementById('toggle-outline');
const closeOutlineButton = document.getElementById('close-outline');
const outlineSidebar = document.getElementById('outline-sidebar');
const outlineContent = document.getElementById('outline-content');
const pdfViewer = document.getElementById('pdf-viewer');
const printButton = document.getElementById('print-pdf');
const downloadButton = document.getElementById('download-pdf');
const fullscreenButton = document.getElementById('toggle-fullscreen');
const pdfContainer = document.getElementById('pdf-container');
const previewViewBtn = document.getElementById('preview-view-btn');
const listViewBtn = document.getElementById('list-view-btn');
// const rotateButton = document.getElementById('rotate-page'); // 버튼 제거됨
// const pageViewModeButton = document.getElementById('page-view-mode'); // 버튼 제거됨
const pdfRenderContainer = document.getElementById('pdf-render-container');
const mainPageContainer = document.getElementById('main-page-container');
const secondPageContainer = document.getElementById('second-page-container');
const translateButton = document.getElementById('translate-page');
const summarizeButton = document.getElementById('summarize-page');
const summarizeFullButton = document.getElementById('summarize-full');

// 현재 뷰 모드 (기본값: 미리보기)
let currentViewMode = 'preview';

// 뷰 모드 전환
previewViewBtn.addEventListener('click', () => {
  if (currentViewMode !== 'preview') {
    currentViewMode = 'preview';
    previewViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
    if (pdfDoc) {
      loadOutline();
    }
  }
});

listViewBtn.addEventListener('click', () => {
  if (currentViewMode !== 'list') {
    currentViewMode = 'list';
    listViewBtn.classList.add('active');
    previewViewBtn.classList.remove('active');
    if (pdfDoc) {
      loadOutline();
    }
  }
});

// 목차 토글
toggleOutlineButton.addEventListener('click', () => {
  outlineSidebar.classList.toggle('hidden');
  pdfViewer.classList.toggle('with-sidebar');
  
  // 목차가 열릴 때 로드
  if (!outlineSidebar.classList.contains('hidden') && pdfDoc) {
    loadOutline();
  }
});

// 목차 닫기
closeOutlineButton.addEventListener('click', () => {
  outlineSidebar.classList.add('hidden');
  pdfViewer.classList.remove('with-sidebar');
});

// 목차 로드
async function loadOutline() {
  if (!pdfDoc) return;
  
  outlineContent.innerHTML = '<div class="outline-loading"><div class="spinner-small"></div><p>로딩 중...</p></div>';
  
  if (currentViewMode === 'preview') {
    // 미리보기 모드: 모든 페이지의 썸네일 표시
    try {
      outlineContent.innerHTML = '';
      const previewGrid = document.createElement('div');
      previewGrid.className = 'preview-grid';
      outlineContent.appendChild(previewGrid);
      
      // 모든 페이지의 썸네일 생성
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        renderPageThumbnail(i, previewGrid);
      }
    } catch (error) {
      console.error('미리보기 로드 오류:', error);
      outlineContent.innerHTML = '<div class="outline-empty">미리보기를 불러올 수 없습니다.</div>';
    }
  } else {
    // 목록 모드: 기존 목차 표시
    try {
      const outline = await pdfDoc.getOutline();
      
      if (!outline || outline.length === 0) {
        outlineContent.innerHTML = '<div class="outline-empty">이 PDF에는 목차가 없습니다.</div>';
        return;
      }
      
      outlineContent.innerHTML = '';
      renderOutlineItems(outline, outlineContent, 1);
    } catch (error) {
      console.error('목차 로드 오류:', error);
      outlineContent.innerHTML = '<div class="outline-empty">목차를 불러올 수 없습니다.</div>';
    }
  }
}

// 페이지 썸네일 렌더링
async function renderPageThumbnail(pageNumber, container) {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.3 }); // 작은 크기로 렌더링
    
    const previewItem = document.createElement('div');
    previewItem.className = 'preview-item';
    if (pageNumber === pageNum) {
      previewItem.classList.add('active');
    }
    
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'preview-thumbnail';
    
    // Canvas 생성
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // 페이지 렌더링
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    thumbnailDiv.appendChild(canvas);
    
    // 페이지 번호 추가
    const pageNumDiv = document.createElement('div');
    pageNumDiv.className = 'preview-page-num';
    pageNumDiv.textContent = pageNumber;
    thumbnailDiv.appendChild(pageNumDiv);
    
    previewItem.appendChild(thumbnailDiv);
    
    // 페이지 라벨 (있는 경우)
    const label = document.createElement('div');
    label.className = 'preview-label';
    label.textContent = `페이지 ${pageNumber}`;
    previewItem.appendChild(label);
    
    // 클릭 이벤트
    previewItem.addEventListener('click', () => {
      pageNum = pageNumber;
      queueRenderPage(pageNum);
      
      // 활성 상태 업데이트
      document.querySelectorAll('.preview-item').forEach(item => item.classList.remove('active'));
      previewItem.classList.add('active');
    });
    
    container.appendChild(previewItem);
  } catch (error) {
    console.error(`페이지 ${pageNumber} 썸네일 렌더링 오류:`, error);
  }
}

// 목차 아이템 렌더링
function renderOutlineItems(items, container, level) {
  items.forEach(item => {
    const outlineItem = document.createElement('div');
    outlineItem.className = `outline-item level-${level}`;
    outlineItem.textContent = item.title;
    
    // 목차 클릭 시 해당 페이지로 이동
    outlineItem.addEventListener('click', async () => {
      if (item.dest) {
        try {
          const destination = await pdfDoc.getDestination(item.dest);
          const pageIndex = await pdfDoc.getPageIndex(destination[0]);
          pageNum = pageIndex + 1;
          queueRenderPage(pageNum);
          
          // 현재 활성 아이템 표시
          document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'));
          outlineItem.classList.add('active');
        } catch (error) {
          console.error('페이지 이동 오류:', error);
        }
      }
    });
    
    container.appendChild(outlineItem);
    
    // 하위 아이템이 있으면 재귀적으로 렌더링
    if (item.items && item.items.length > 0) {
      renderOutlineItems(item.items, container, Math.min(level + 1, 3));
    }
  });
}

// 회전 기능 - 버튼이 제거되어 주석 처리
// rotateButton.addEventListener('click', () => {
//   rotation = (rotation + 90) % 360;
//   queueRenderPage(pageNum);
// });

// 페이지 뷰 모드 전환 - 버튼이 제거되어 주석 처리
// pageViewModeButton.addEventListener('click', () => {
//   if (pageViewMode === 'single') {
//     pageViewMode = 'double';
//     pdfRenderContainer.classList.remove('single-page');
//     pdfRenderContainer.classList.add('double-page');
//     pageViewModeButton.querySelector('.material-symbols-rounded').textContent = 'menu_book';
//     pageViewModeButton.title = chrome.i18n.getMessage('pdfViewerSinglePage');
//     
//     // 홀수 페이지로 조정
//     if (pageNum % 2 === 0) {
//       pageNum--;
//       pageNumInput.value = pageNum;
//     }
//   } else {
//     pageViewMode = 'single';
//     pdfRenderContainer.classList.remove('double-page');
//     pdfRenderContainer.classList.add('single-page');
//     pageViewModeButton.querySelector('.material-symbols-rounded').textContent = 'auto_stories';
//     pageViewModeButton.title = chrome.i18n.getMessage('pdfViewerDoublePage');
//   }
//   
//   queueRenderPage(pageNum);
// });

// 인쇄 기능
printButton.addEventListener('click', () => {
  if (pdfDoc) {
    window.print();
  }
});

// 다운로드 기능
downloadButton.addEventListener('click', async () => {
  const pdfUrl = getPdfUrl();
  if (!pdfUrl) return;
  
  try {
    // PDF 파일명 추출
    let filename = 'document.pdf';
    if (pdfDoc && pdfDoc._pdfInfo && pdfDoc._pdfInfo.title) {
      filename = pdfDoc._pdfInfo.title + '.pdf';
    } else {
      const urlParts = pdfUrl.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      if (lastPart.includes('.pdf')) {
        filename = decodeURIComponent(lastPart.split('?')[0]);
      }
    }
    
    // 다운로드 링크 생성
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('다운로드 오류:', error);
  }
});

// 전체화면 토글
fullscreenButton.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    pdfContainer.requestFullscreen().then(() => {
      pdfContainer.classList.add('fullscreen');
      // 아이콘 변경
      const icon = fullscreenButton.querySelector('.material-symbols-rounded');
      if (icon) {
        icon.textContent = 'fullscreen_exit';
      }
      fullscreenButton.title = chrome.i18n.getMessage('pdfViewerFullscreenExit');
    }).catch(err => {
      console.error('전체화면 전환 오류:', err);
    });
  } else {
    document.exitFullscreen().then(() => {
      pdfContainer.classList.remove('fullscreen');
      // 아이콘 변경
      const icon = fullscreenButton.querySelector('.material-symbols-rounded');
      if (icon) {
        icon.textContent = 'fullscreen';
      }
      fullscreenButton.title = chrome.i18n.getMessage('pdfViewerFullscreen');
    });
  }
});

// 번역 기능
translateButton.addEventListener('click', async () => {
  if (!pdfDoc) return;
  
  try {
    // 현재 페이지의 텍스트 가져오기
    let pageText = await getPageTextContent(pageNum);
    
    // 더블 페이지 모드인 경우 두 번째 페이지 텍스트도 가져오기
    if (pageViewMode === 'double' && pageNum < pdfDoc.numPages) {
      const secondPageText = await getPageTextContent(pageNum + 1);
      pageText += '\n\n--- 다음 페이지 ---\n\n' + secondPageText;
    }
    
    if (!pageText || pageText.trim().length === 0) {
      alert('번역할 텍스트가 없습니다.');
      return;
    }
    
    // 챗봇이 열려있지 않으면 열기
    // 챗봇은 항상 열려있음 (사이드패널)
    
    // 챗봇에 번역 요청 전송
    setTimeout(() => {
      if (chatbotIframe && chatbotIframe.contentWindow) {
        const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
        chatbotIframe.contentWindow.postMessage({
          type: "TRANSLATE_PDF_PAGE",
          pageText: pageText,
          pageNumber: pageNum
        }, chatbotOrigin);
      }
    }, 100);
  } catch (error) {
    console.error('페이지 번역 오류:', error);
    alert('페이지 번역 중 오류가 발생했습니다.');
  }
});

// 현재 페이지 요약 기능
summarizeButton.addEventListener('click', async () => {
  if (!pdfDoc) return;
  
  try {
    // 현재 페이지의 텍스트 가져오기
    let pageText = await getPageTextContent(pageNum);
    
    // 더블 페이지 모드인 경우 두 번째 페이지 텍스트도 가져오기
    if (pageViewMode === 'double' && pageNum < pdfDoc.numPages) {
      const secondPageText = await getPageTextContent(pageNum + 1);
      pageText += '\n\n--- 다음 페이지 ---\n\n' + secondPageText;
    }
    
    if (!pageText || pageText.trim().length === 0) {
      alert('요약할 텍스트가 없습니다.');
      return;
    }
    
    // 챗봇이 열려있지 않으면 열기
    // 챗봇은 항상 열려있음 (사이드패널)
    
    // 챗봇에 요약 요청 전송
    setTimeout(() => {
      if (chatbotIframe && chatbotIframe.contentWindow) {
        const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
        chatbotIframe.contentWindow.postMessage({
          type: "SUMMARIZE_PDF_PAGE",
          pageText: pageText,
          pageNumber: pageNum
        }, chatbotOrigin);
      }
    }, 100);
  } catch (error) {
    console.error('페이지 요약 오류:', error);
    alert('페이지 요약 중 오류가 발생했습니다.');
  }
});

// 전체 PDF 요약 기능
summarizeFullButton.addEventListener('click', async () => {
  if (!pdfDoc) return;
  
  try {
    // 로딩 표시
    summarizeFullButton.disabled = true;
    const originalText = summarizeFullButton.querySelector('.material-symbols-rounded').textContent;
    summarizeFullButton.querySelector('.material-symbols-rounded').textContent = 'hourglass_empty';
    
    // 전체 PDF 텍스트 가져오기
    let fullText = '';
    const totalPages = pdfDoc.numPages;
    const maxPages = Math.min(totalPages, 30); // 30페이지로 제한
    
    for (let i = 1; i <= maxPages; i++) {
      try {
        const pageText = await getPageTextContent(i);
        if (pageText && pageText.trim()) {
          fullText += `\n\n--- 페이지 ${i} ---\n\n${pageText}`;
        }
      } catch (pageError) {
        console.error(`페이지 ${i} 텍스트 추출 오류:`, pageError);
      }
    }
    
    if (!fullText || fullText.trim().length === 0) {
      alert('요약할 텍스트가 없습니다.');
      return;
    }
    
    // 텍스트가 너무 길면 잘라내기 (약 20000자로 제한)
    if (fullText.length > 20000) {
      fullText = fullText.substring(0, 20000) + '\n\n[텍스트가 너무 길어 일부만 요약합니다]';
    }
    
    // 챗봇이 열려있지 않으면 열기
    // 챗봇은 항상 열려있음 (사이드패널)
    
    // 챗봇에 요약 요청 전송
    setTimeout(() => {
      if (chatbotIframe && chatbotIframe.contentWindow) {
        const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
        chatbotIframe.contentWindow.postMessage({
          type: "SUMMARIZE_PDF_FULL",
          pageText: fullText,
          totalPages: totalPages,
          summarizedPages: maxPages
        }, chatbotOrigin);
      }
    }, 100);
  } catch (error) {
    console.error('PDF 전체 요약 오류:', error);
    alert('PDF 요약 중 오류가 발생했습니다.');
  } finally {
    // 버튼 복원
    summarizeFullButton.disabled = false;
    summarizeFullButton.querySelector('.material-symbols-rounded').textContent = 'auto_awesome';
  }
});

// 전체화면 변경 이벤트
document.addEventListener('fullscreenchange', () => {
  const icon = fullscreenButton.querySelector('.material-symbols-rounded');
  if (!document.fullscreenElement) {
    pdfContainer.classList.remove('fullscreen');
    if (icon) {
      icon.textContent = 'fullscreen';
    }
    fullscreenButton.title = chrome.i18n.getMessage('pdfViewerFullscreen');
  } else {
    if (icon) {
      icon.textContent = 'fullscreen_exit';
    }
    fullscreenButton.title = chrome.i18n.getMessage('pdfViewerFullscreenExit');
  }
});

// i18n 초기화 및 버튼 텍스트 설정
function applyI18nToButtons() {
  // 목차 버튼
  toggleOutlineButton.title = chrome.i18n.getMessage('pdfViewerOutline');
  
  // 페이지 네비게이션
  // prevButton.title = chrome.i18n.getMessage('pdfViewerPrevPage'); // 버튼 제거됨
  // nextButton.title = chrome.i18n.getMessage('pdfViewerNextPage'); // 버튼 제거됨
  
  // 줌 버튼
  zoomOutButton.title = chrome.i18n.getMessage('pdfViewerZoomOut');
  zoomInButton.title = chrome.i18n.getMessage('pdfViewerZoomIn');
  
  // 페이지 맞춤 버튼 (초기값)
  if (fitMode === 'none') {
    fitPageButton.title = chrome.i18n.getMessage('pdfViewerFitWidth');
  } else {
    fitPageButton.title = chrome.i18n.getMessage('pdfViewerActualSize');
  }
  
  // 회전 버튼 - 버튼이 제거되어 주석 처리
  // rotateButton.title = chrome.i18n.getMessage('pdfViewerRotate');
  
  // 페이지 보기 모드 버튼 - 버튼이 제거되어 주석 처리
  // if (pageViewMode === 'single') {
  //   pageViewModeButton.title = chrome.i18n.getMessage('pdfViewerDoublePage');
  // } else {
  //   pageViewModeButton.title = chrome.i18n.getMessage('pdfViewerSinglePage');
  // }
  
  // 번역 및 요약 버튼
  translateButton.title = chrome.i18n.getMessage('pdfViewerTranslatePage');
  summarizeButton.title = chrome.i18n.getMessage('pdfViewerSummarizePage');
  summarizeFullButton.title = chrome.i18n.getMessage('pdfViewerSummarizeFull');
  
  // 인쇄 및 다운로드 버튼
  printButton.title = chrome.i18n.getMessage('pdfViewerPrint');
  downloadButton.title = chrome.i18n.getMessage('pdfViewerDownload');
  
  // 전체화면 버튼
  if (!document.fullscreenElement) {
    fullscreenButton.title = chrome.i18n.getMessage('pdfViewerFullscreen');
  } else {
    fullscreenButton.title = chrome.i18n.getMessage('pdfViewerFullscreenExit');
  }
}

// 페이지 로드 시 PDF 로드
window.addEventListener('DOMContentLoaded', () => {
  // i18n 적용
  applyI18nToButtons();
  
  const pdfUrl = getPdfUrl();
  if (pdfUrl) {
    loadPdf(pdfUrl);
  } else {
    errorMessage.classList.remove('hidden');
    errorText.textContent = 'PDF 파일 경로가 지정되지 않았습니다.';
  }
  
  // Scroll event listener for continuous mode
  const pdfRenderContainer = document.getElementById('pdf-render-container');
  if (pdfRenderContainer) {
    let scrollTimeout;
    pdfRenderContainer.addEventListener('scroll', () => {
      if (pageViewMode === 'continuous') {
        // Debounce scroll events
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          window.continuousScroll.checkVisiblePages();
        }, 100);
      }
    });
  }
});

// 리사이즈 이벤트 리스너 추가
// 리사이즈 기능 제거됨