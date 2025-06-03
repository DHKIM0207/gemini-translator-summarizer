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
let canvas = document.getElementById('pdf-canvas');
let ctx = canvas.getContext('2d');
let textLayer = document.getElementById('text-layer');

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

// PDF 문서 로드
async function loadPdf(url) {
  try {
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
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: scale });
    console.log('Viewport:', viewport.width, 'x', viewport.height);
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    const renderTask = page.render(renderContext);
    await renderTask.promise;
    
    // 텍스트 레이어 렌더링
    textLayer.innerHTML = '';
    textLayer.style.width = viewport.width + 'px';
    textLayer.style.height = viewport.height + 'px';
    
    // 텍스트 레이어는 절대 위치로 캔버스 위에 배치됨
    textLayer.style.left = '0';
    textLayer.style.top = '0';
    
    const textContent = await page.getTextContent();
    
    // PDF.js의 새로운 TextLayer API 사용 시도
    if (pdfjsLib.TextLayer) {
      console.log('새로운 TextLayer API 사용');
      const textLayerInstance = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport: viewport
      });
      await textLayerInstance.render();
    } else {
      console.log('기존 renderTextLayer API 사용');
      const textLayerRenderTask = pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayer,
        viewport: viewport,
        textDivs: []
      });
      await textLayerRenderTask.promise;
    }
    
    // 텍스트 선택 가능하도록 설정
    textLayer.style.pointerEvents = 'auto';
    textLayer.style.userSelect = 'text';
    textLayer.style.cursor = 'text';
    
    // 텍스트 레이어의 각 span 요소에도 스타일 적용
    const textSpans = textLayer.querySelectorAll('span');
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
    
    pageRendering = false;
    loadingIndicator.classList.add('hidden');
    
    if (pageNumPending !== null) {
      renderPage(pageNumPending);
      pageNumPending = null;
    }
  } catch (error) {
    console.error('페이지 렌더링 오류:', error);
    pageRendering = false;
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
  pageNum--;
  pageNumInput.value = pageNum;
  queueRenderPage(pageNum);
}

function onNextPage() {
  if (pageNum >= pdfDoc.numPages) return;
  pageNum++;
  pageNumInput.value = pageNum;
  queueRenderPage(pageNum);
}

// 줌 기능
function zoomIn() {
  scale = Math.min(scale * 1.2, 3.0);
  zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
  queueRenderPage(pageNum);
}

function zoomOut() {
  scale = Math.max(scale / 1.2, 0.5);
  zoomLevelSpan.textContent = Math.round(scale * 100) + '%';
  queueRenderPage(pageNum);
}

function fitPage() {
  const container = document.getElementById('pdf-viewer');
  const containerWidth = container.clientWidth - 40; // padding 고려
  
  pdfDoc.getPage(pageNum).then(page => {
    const viewport = page.getViewport({ scale: 1.0 });
    scale = containerWidth / viewport.width;
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
      
      const btnX = rect.right + 5;
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