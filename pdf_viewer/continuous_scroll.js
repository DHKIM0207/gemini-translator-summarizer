// Continuous scrolling implementation for PDF viewer

// Global variables for continuous scrolling
let renderedPages = new Map(); // Track rendered pages
let visiblePages = new Set(); // Currently visible pages
let pageContainers = new Map(); // Page container elements

// Expose visiblePages globally for search functionality
window.visiblePages = visiblePages;

// Create all page containers
async function createAllPageContainers() {
  console.log('Creating all page containers for', pdfDoc.numPages, 'pages');
  const container = document.getElementById('pdf-render-container');
  container.innerHTML = ''; // Clear existing content
  container.className = 'continuous-scroll';
  
  // Reset tracking
  renderedPages.clear();
  visiblePages.clear();
  pageContainers.clear();
  
  // Create all page containers first
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const pageContainer = document.createElement('div');
    pageContainer.className = 'page-container';
    pageContainer.id = `page-container-${i}`;
    pageContainer.dataset.pageNumber = i;
    
    const canvas = document.createElement('canvas');
    canvas.id = `pdf-canvas-${i}`;
    canvas.className = 'pdf-page-canvas';
    
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    textLayer.id = `text-layer-${i}`;
    
    const pageLabel = document.createElement('div');
    pageLabel.className = 'page-number-label';
    pageLabel.textContent = `${i} / ${pdfDoc.numPages}`;
    
    pageContainer.appendChild(canvas);
    pageContainer.appendChild(textLayer);
    pageContainer.appendChild(pageLabel);
    container.appendChild(pageContainer);
    
    pageContainers.set(i, pageContainer);
  }
  
  // Set placeholder heights for all pages
  console.log('Setting page dimensions...');
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: scale || 1.0, rotation: rotation || 0 });
      const pageContainer = document.getElementById(`page-container-${i}`);
      const canvas = document.getElementById(`pdf-canvas-${i}`);
      
      if (pageContainer && canvas) {
        pageContainer.style.width = viewport.width + 'px';
        pageContainer.style.height = viewport.height + 'px';
        pageContainer.style.marginBottom = '20px';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
      }
    } catch (error) {
      console.error(`Error setting dimensions for page ${i}:`, error);
    }
  }
  
  // Ensure we start at the top
  container.scrollTop = 0;
  console.log('All page containers created, scrollTop:', container.scrollTop);
}

// Render a specific page
async function renderContinuousPage(pageNumber) {
  if (!pdfDoc || renderedPages.has(pageNumber)) return;
  
  console.log(`Rendering page ${pageNumber}`);
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const canvas = document.getElementById(`pdf-canvas-${pageNumber}`);
    const ctx = canvas.getContext('2d');
    const textLayer = document.getElementById(`text-layer-${pageNumber}`);
    
    if (!canvas || !ctx) {
      console.error(`Canvas not found for page ${pageNumber}`);
      return;
    }
    
    const viewport = page.getViewport({ scale: scale || 1.0, rotation: rotation || 0 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Render text layer
    textLayer.innerHTML = '';
    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({
      textContent: textContent,
      container: textLayer,
      viewport: viewport,
      textDivs: []
    });
    
    renderedPages.set(pageNumber, true);
    console.log(`Page ${pageNumber} rendered successfully`);
    
    // If search is active and this page has results, re-apply highlights immediately
    if (window.pdfSearch && window.pdfSearch.searchResults.length > 0 && window.pdfSearch.searchInput.value.trim()) {
      const hasResultsOnPage = window.pdfSearch.searchResults.some(result => result.pageNum === pageNumber);
      if (hasResultsOnPage) {
        setTimeout(() => {
          const textLayer = document.getElementById(`text-layer-${pageNumber}`);
          if (textLayer && textLayer.children.length > 0) {
            if (window.pdfSearch.highlightAll) {
              window.pdfSearch.applyHighlightsToTextLayer(textLayer, window.pdfSearch.searchInput.value.trim(), pageNumber);
            } else if (window.pdfSearch.currentResultIndex >= 0) {
              const currentResult = window.pdfSearch.searchResults[window.pdfSearch.currentResultIndex];
              if (currentResult && currentResult.pageNum === pageNumber) {
                window.pdfSearch.highlightCurrentResult();
              }
            }
          }
        }, 100);
      }
    }
  } catch (error) {
    console.error(`페이지 ${pageNumber} 렌더링 오류:`, error);
  }
}

// Check visible pages and render them
function checkVisiblePages() {
  const container = document.getElementById('pdf-render-container');
  if (!container || !pdfDoc) return;
  
  console.log('Checking visible pages, container scrollTop:', container.scrollTop);
  
  const containerRect = container.getBoundingClientRect();
  const newVisiblePages = new Set();
  let mostVisiblePage = null;
  let maxVisibleHeight = 0;
  
  // Check all page containers
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const pageContainer = document.getElementById(`page-container-${i}`);
    if (!pageContainer) continue;
    
    // Get position relative to container
    const pageTop = pageContainer.offsetTop - container.scrollTop;
    const pageBottom = pageTop + pageContainer.offsetHeight;
    
    // Check if page is visible (with buffer space)
    if (pageBottom >= -200 && pageTop <= container.clientHeight + 200) {
      newVisiblePages.add(i);
      
      // Calculate visible height of this page
      const visibleTop = Math.max(0, pageTop);
      const visibleBottom = Math.min(container.clientHeight, pageBottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      
      // Track the page with the most visible content
      if (visibleHeight > maxVisibleHeight) {
        maxVisibleHeight = visibleHeight;
        mostVisiblePage = i;
      }
      
      // Render if not already rendered
      if (!renderedPages.has(i)) {
        renderContinuousPage(i);
      }
    }
  }
  
  visiblePages = newVisiblePages;
  window.visiblePages = visiblePages; // Update global reference
  console.log('Visible pages:', Array.from(newVisiblePages), 'Most visible:', mostVisiblePage, 'Height:', maxVisibleHeight);
  
  // Update current page number based on the most visible page
  if (mostVisiblePage !== null && mostVisiblePage !== window.pageNum) {
    console.log('Updating page number from', window.pageNum, 'to', mostVisiblePage);
    window.pageNum = mostVisiblePage;
    const pageNumInput = document.getElementById('page-num');
    if (pageNumInput) {
      pageNumInput.value = mostVisiblePage;
    }
  }
}

// Re-render all pages (for zoom, rotation, etc.)
async function rerenderAllPages() {
  renderedPages.clear();
  await createAllPageContainers();
  checkVisiblePages();
  
  // Re-apply search highlights if search is active
  if (window.pdfSearch && window.pdfSearch.searchResults.length > 0) {
    // Give time for text layers to render
    setTimeout(() => {
      window.pdfSearch.reapplyHighlights();
    }, 500);
  }
}

// Scroll to specific page
function scrollToPage(pageNumber) {
  const pageContainer = document.getElementById(`page-container-${pageNumber}`);
  if (pageContainer) {
    // Get the PDF render container and header height
    const pdfRenderContainer = document.getElementById('pdf-render-container');
    const headerHeight = document.getElementById('pdf-header').offsetHeight;
    
    // Calculate the position
    const containerTop = pdfRenderContainer.getBoundingClientRect().top;
    const pageTop = pageContainer.getBoundingClientRect().top;
    const scrollDistance = pageTop - containerTop;
    
    // Scroll to the page
    pdfRenderContainer.scrollTop += scrollDistance;
    
    // Update page number
    pageNum = pageNumber;
    const pageNumInput = document.getElementById('page-num');
    if (pageNumInput) {
      pageNumInput.value = pageNumber;
    }
    
    // Ensure the page is rendered
    setTimeout(() => {
      if (!renderedPages.has(pageNumber)) {
        renderContinuousPage(pageNumber);
      }
    }, 100);
  }
}

// Ensure scroll starts at page 1
function ensureFirstPageVisible() {
  const container = document.getElementById('pdf-render-container');
  const firstPage = document.getElementById('page-container-1');
  
  if (container && firstPage) {
    // Get all pages and calculate total height before first page
    let heightBeforeFirstPage = 0;
    for (let i = 1; i < 1; i++) {
      const page = document.getElementById(`page-container-${i}`);
      if (page) {
        heightBeforeFirstPage += page.offsetHeight + 20; // Include gap
      }
    }
    
    // Scroll to exact position
    container.scrollTop = heightBeforeFirstPage;
    console.log('Ensured first page visible, scrollTop set to:', heightBeforeFirstPage);
    
    // Render first few pages immediately
    for (let i = 1; i <= Math.min(3, pdfDoc.numPages); i++) {
      if (!renderedPages.has(i)) {
        renderContinuousPage(i);
      }
    }
  }
}

// Export functions
window.continuousScroll = {
  createAllPageContainers,
  renderContinuousPage,
  checkVisiblePages,
  rerenderAllPages,
  scrollToPage,
  ensureFirstPageVisible
};