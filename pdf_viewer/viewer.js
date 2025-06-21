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
let pageViewMode = 'single'; // 'single' 또는 'double'
let fitMode = 'none'; // 'width' 또는 'none'
let canvas = document.getElementById('pdf-canvas');
let ctx = canvas.getContext('2d');
let textLayer = document.getElementById('text-layer');
let canvas2 = document.getElementById('pdf-canvas-2');
let ctx2 = canvas2.getContext('2d');
let textLayer2 = document.getElementById('text-layer-2');

// UI 요소들
const prevButton = document.getElementById('prev-page');
const nextButton = document.getElementById('next-page');
const pageNumInput = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const zoomInButton = document.getElementById('zoom-in');
const zoomOutButton = document.getElementById('zoom-out');
const zoomLevelSpan = document.getElementById('zoom-level');
const fitPageButton = document.getElementById('fit-page');
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const pdfTitle = document.getElementById('pdf-title');
const fabButton = document.getElementById('gemini-fab');

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
    console.log('PDF 문서 로드 완료, 페이지 수:', pdfDoc.numPages);
    
    pageCountSpan.textContent = pdfDoc.numPages;
    pageNumInput.max = pdfDoc.numPages;
    
    // 문서 제목 설정
    const info = await pdfDoc.getMetadata();
    if (info.info && info.info.Title) {
      pdfTitle.textContent = info.info.Title;
      document.title = `${info.info.Title} - PDF 뷰어`;
    } else {
      const filename = url.split('/').pop().split('?')[0];
      pdfTitle.textContent = decodeURIComponent(filename);
      document.title = `${decodeURIComponent(filename)} - PDF 뷰어`;
    }
    
    // 초기 실제 크기(100%) 설정
    scale = 1.0;
    zoomLevelSpan.textContent = '100%';
    
    // 첫 페이지 렌더링
    renderPage(pageNum);
    
  } catch (error) {
    console.error('PDF 로드 오류:', error);
    loadingIndicator.classList.add('hidden');
    errorMessage.classList.remove('hidden');
    errorText.textContent = `PDF를 불러올 수 없습니다: ${error.message}`;
  }
}

// 페이지 렌더링
async function renderPage(num) {
  pageRendering = true;
  console.log(`페이지 ${num} 렌더링 시작`);
  
  try {
    // 첫 번째 페이지 렌더링
    await renderSinglePage(num, canvas, ctx, textLayer);
    
    // 더블 페이지 모드인 경우 두 번째 페이지도 렌더링
    if (pageViewMode === 'double' && num < pdfDoc.numPages) {
      secondPageContainer.style.display = 'block';
      await renderSinglePage(num + 1, canvas2, ctx2, textLayer2);
    } else {
      secondPageContainer.style.display = 'none';
    }
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
  queueRenderPage(pageNum);
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
  queueRenderPage(pageNum);
}

// 줌 기능
function zoomIn() {
  scale = Math.min(scale * 1.2, 3.0);
  zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
  
  // 수동 줌 시 현재 상태가 너비 맞춤이면 해제
  if (fitMode === 'width') {
    fitMode = 'none';
    fitPageButton.title = '너비에 맞추기';
    fitPageButton.querySelector('.material-symbols-outlined').textContent = 'fit_page_width';
  }
  
  queueRenderPage(pageNum);
}

function zoomOut() {
  scale = Math.max(scale / 1.2, 0.5);
  zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
  
  // 수동 줌 시 현재 상태가 너비 맞춤이면 해제
  if (fitMode === 'width') {
    fitMode = 'none';
    fitPageButton.title = '너비에 맞추기';
    fitPageButton.querySelector('.material-symbols-outlined').textContent = 'fit_page_width';
  }
  
  queueRenderPage(pageNum);
}

function fitPage() {
  // 토글: none (실제 크기) <-> width (너비에 맞추기)
  const container = document.getElementById('pdf-viewer');
  const containerWidth = container.clientWidth - 40; // padding 고려
  
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
      fitPageButton.title = '실제 크기';
      fitPageButton.querySelector('.material-symbols-outlined').textContent = 'fit_screen';
    } else {
      // 너비에 맞추기에서 실제 크기로 전환
      fitMode = 'none';
      scale = 1.0;
      fitPageButton.title = '너비에 맞추기';
      fitPageButton.querySelector('.material-symbols-outlined').textContent = 'fit_page_width';
    }
    
    zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
    queueRenderPage(pageNum);
  });
}

// 이벤트 리스너
prevButton.addEventListener('click', onPrevPage);
nextButton.addEventListener('click', onNextPage);
zoomInButton.addEventListener('click', zoomIn);
zoomOutButton.addEventListener('click', zoomOut);
fitPageButton.addEventListener('click', fitPage);

pageNumInput.addEventListener('change', () => {
  const num = parseInt(pageNumInput.value);
  if (num >= 1 && num <= pdfDoc.numPages) {
    pageNum = num;
    queueRenderPage(pageNum);
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

// 마우스휠 이벤트 처리 (Ctrl/Cmd + 휠로 줌)
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    
    // deltaY가 음수면 위로 스크롤 (확대), 양수면 아래로 스크롤 (축소)
    if (e.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  }
}, { passive: false });

// 챗봇 iframe 관련 변수
let chatbotIframe = null;
let iframeVisible = false;

// 챗봇 iframe 생성 함수
function createChatbotIframe() {
  if (chatbotIframe) return;
  
  chatbotIframe = document.createElement('iframe');
  chatbotIframe.id = 'gemini-chatbot-iframe';
  chatbotIframe.src = chrome.runtime.getURL('chatbot_ui/chatbot.html');
  chatbotIframe.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    height: calc(100vh - 100px);
    max-width: 90vw;
    max-height: 90vh;
    min-height: 700px;
    border: none;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    display: none;
  `;
  chatbotIframe.setAttribute('allowfullscreen', '');
  chatbotIframe.setAttribute('allow', 'clipboard-write');
  document.body.appendChild(chatbotIframe);
}

// 챗봇 토글 함수
function toggleChatbot() {
  if (!chatbotIframe) {
    createChatbotIframe();
  }
  
  iframeVisible = !iframeVisible;
  if (iframeVisible) {
    chatbotIframe.style.display = 'block';
    fabButton.style.display = 'none';
  } else {
    chatbotIframe.style.display = 'none';
    fabButton.style.display = 'flex';
  }
}

// FAB 버튼 처리
window.addEventListener('DOMContentLoaded', () => {
  console.log('PDF 뷰어 준비 완료');
  
  // FAB 버튼 표시 및 이벤트 리스너 추가
  if (fabButton) {
    fabButton.style.display = 'flex';
    fabButton.addEventListener('click', () => {
      console.log('FAB 버튼 클릭됨');
      toggleChatbot();
    });
  }
});

// 챗봇과의 메시지 통신
window.addEventListener("message", (event) => {
  if (!chatbotIframe || event.source !== chatbotIframe.contentWindow) return;
  
  const chatbotOrigin = new URL(chrome.runtime.getURL('chatbot_ui/chatbot.html')).origin;
  if (event.origin !== chatbotOrigin) return;
  
  if (event.data.type === "CLOSE_CHATBOT") {
    toggleChatbot();
  } else if (event.data.type === "GET_SELECTED_TEXT") {
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

// 호버 번역 버튼 관련 변수
let hoverTranslateButton = null;
let hideHoverButtonTimeout = null;

// 호버 번역 버튼 생성
function createHoverTranslateButton() {
  if (!hoverTranslateButton) {
    hoverTranslateButton = document.createElement('button');
    hoverTranslateButton.id = 'selection-translate-hover-btn';
    hoverTranslateButton.style.cssText = `
      position: fixed;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background-color: #1a73e8;
      color: white;
      border: none;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      z-index: 10000;
      transition: transform 0.2s;
    `;
    hoverTranslateButton.innerHTML = '<span class="material-symbols-outlined" style="color: white !important; font-size: 24px; line-height: 1;">language_korean_latin</span>';
    hoverTranslateButton.addEventListener('click', handleHoverTranslateClick);
    document.body.appendChild(hoverTranslateButton);
  }
}

// 호버 번역 버튼 표시
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

// 호버 번역 버튼 숨기기
function hideHoverTranslateButton() {
  if (hoverTranslateButton) {
    hoverTranslateButton.style.display = 'none';
  }
  clearTimeout(hideHoverButtonTimeout);
}

// 호버 번역 버튼 클릭 처리
function handleHoverTranslateClick(event) {
  event.stopPropagation();
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) {
    hideHoverTranslateButton();
    return;
  }
  
  // 챗봇이 열려있지 않으면 열기
  if (!iframeVisible) {
    toggleChatbot();
  }
  
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
  
  hideHoverTranslateButton();
}

// 마우스 이벤트 리스너 추가
document.addEventListener('mouseup', (event) => {
  if (hoverTranslateButton && hoverTranslateButton.contains(event.target)) {
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
      
      const btnX = rect.left + (rect.width / 2) - 21;
      const btnY = rect.bottom + 5;
      showHoverTranslateButton(btnX, btnY);
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
const rotateButton = document.getElementById('rotate-page');
const pageViewModeButton = document.getElementById('page-view-mode');
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

// 회전 기능
rotateButton.addEventListener('click', () => {
  rotation = (rotation + 90) % 360;
  queueRenderPage(pageNum);
});

// 페이지 뷰 모드 전환
pageViewModeButton.addEventListener('click', () => {
  if (pageViewMode === 'single') {
    pageViewMode = 'double';
    pdfRenderContainer.classList.remove('single-page');
    pdfRenderContainer.classList.add('double-page');
    pageViewModeButton.querySelector('.material-symbols-rounded').textContent = 'menu_book';
    pageViewModeButton.title = '단일 페이지';
    
    // 홀수 페이지로 조정
    if (pageNum % 2 === 0) {
      pageNum--;
      pageNumInput.value = pageNum;
    }
  } else {
    pageViewMode = 'single';
    pdfRenderContainer.classList.remove('double-page');
    pdfRenderContainer.classList.add('single-page');
    pageViewModeButton.querySelector('.material-symbols-rounded').textContent = 'auto_stories';
    pageViewModeButton.title = '두 페이지';
  }
  
  queueRenderPage(pageNum);
});

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
    if (!iframeVisible) {
      toggleChatbot();
    }
    
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
    if (!iframeVisible) {
      toggleChatbot();
    }
    
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
    if (!iframeVisible) {
      toggleChatbot();
    }
    
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
  } else {
    if (icon) {
      icon.textContent = 'fullscreen_exit';
    }
  }
});

// 페이지 로드 시 PDF 로드
window.addEventListener('DOMContentLoaded', () => {
  const pdfUrl = getPdfUrl();
  if (pdfUrl) {
    loadPdf(pdfUrl);
  } else {
    errorMessage.classList.remove('hidden');
    errorText.textContent = 'PDF 파일 경로가 지정되지 않았습니다.';
  }
});