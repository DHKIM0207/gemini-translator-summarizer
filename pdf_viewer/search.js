// PDF 검색 기능 구현

class PDFSearch {
  constructor() {
    this.searchBtn = document.getElementById('search-btn');
    this.searchContainer = document.getElementById('search-container');
    this.searchInput = document.getElementById('search-input');
    this.searchPrev = document.getElementById('search-prev');
    this.searchNext = document.getElementById('search-next');
    this.searchCount = document.getElementById('search-count');
    this.highlightAllBtn = document.getElementById('highlight-all');
    this.caseSensitiveBtn = document.getElementById('case-sensitive');
    this.searchCloseBtn = document.getElementById('search-close');
    
    this.searchResults = [];
    this.currentResultIndex = -1;
    this.caseSensitive = false;
    this.highlightAll = false;
    
    this.initEventListeners();
  }
  
  initEventListeners() {
    // 검색 버튼 클릭
    this.searchBtn.addEventListener('click', () => {
      this.toggleSearch();
    });
    
    // 닫기 버튼
    this.searchCloseBtn.addEventListener('click', () => {
      this.closeSearch();
    });
    
    // 검색 입력에 디바운스 적용
    let searchTimeout;
    this.searchInput.addEventListener('input', async () => {
      clearTimeout(searchTimeout);
      
      // 입력 중임을 표시
      this.searchCount.textContent = '검색 중...';
      this.searchCount.classList.remove('hidden');
      
      // 300ms 후에 검색 실행
      searchTimeout = setTimeout(async () => {
        await this.performSearch();
      }, 300);
    });
    
    // 엔터키로 다음 결과로 이동
    this.searchInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          await this.findPrevious();
        } else {
          await this.findNext();
        }
      }
    });
    
    // 이전/다음 버튼
    this.searchPrev.addEventListener('click', async () => await this.findPrevious());
    this.searchNext.addEventListener('click', async () => await this.findNext());
    
    // 모두 강조 표시 버튼
    this.highlightAllBtn.addEventListener('click', async () => {
      this.highlightAll = !this.highlightAll;
      this.highlightAllBtn.classList.toggle('active', this.highlightAll);
      await this.performSearch();
    });
    
    // 대/소문자 구분 버튼
    this.caseSensitiveBtn.addEventListener('click', async () => {
      this.caseSensitive = !this.caseSensitive;
      this.caseSensitiveBtn.classList.toggle('active', this.caseSensitive);
      await this.performSearch();
    });
    
    // ESC 키로 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.searchContainer.classList.contains('hidden')) {
        this.closeSearch();
      }
    });
    
    // 스크롤 시 보이는 페이지에 하이라이트 적용
    this.applyHighlightsOnScroll = () => {
      if (this.searchResults.length > 0 && this.highlightAll) {
        const visiblePages = window.visiblePages || new Set();
        visiblePages.forEach(pageNum => {
          const textLayer = document.querySelector(`#page-container-${pageNum} .textLayer`);
          if (textLayer && textLayer.children.length > 0) {
            this.applyHighlightsToTextLayer(textLayer, this.searchInput.value.trim(), pageNum);
          }
        });
      }
    };
    
    // 스크롤 이벤트에 디바운스 적용
    let scrollTimeout;
    const container = document.getElementById('pdf-render-container');
    if (container) {
      container.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          this.applyHighlightsOnScroll();
        }, 200);
      });
    }
  }
  
  toggleSearch() {
    if (this.searchContainer.classList.contains('hidden')) {
      this.openSearch();
    } else {
      this.closeSearch();
    }
  }
  
  openSearch() {
    this.searchContainer.classList.remove('hidden');
    
    // 검색 버튼의 위치를 기준으로 팝업 위치 설정
    const searchBtnRect = this.searchBtn.getBoundingClientRect();
    this.searchContainer.style.top = searchBtnRect.top + 'px';
    this.searchContainer.style.left = (searchBtnRect.right + 10) + 'px';
    
    this.searchInput.focus();
    this.searchInput.select();
  }
  
  closeSearch() {
    this.searchContainer.classList.add('hidden');
    this.clearHighlights();
    this.searchInput.value = '';
    this.searchCount.classList.add('hidden');
    this.searchResults = [];
    this.currentResultIndex = -1;
  }
  
  async performSearch() {
    const query = this.searchInput.value.trim();
    
    if (!query) {
      this.clearHighlights();
      this.searchCount.classList.add('hidden');
      this.searchResults = [];
      this.currentResultIndex = -1;
      return;
    }
    
    this.clearHighlights();
    this.searchResults = [];
    this.currentResultIndex = -1;
    
    // 전체 PDF 페이지에서 검색
    const totalPages = window.pdfDoc ? window.pdfDoc.numPages : 0;
    
    // 모든 페이지에서 PDF.js API를 사용하여 검색
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      await this.searchInPage(pageNum, query);
    }
    
    // 검색 결과 업데이트
    if (this.searchResults.length > 0) {
      this.currentResultIndex = 0;
      this.updateSearchCount();
      
      // "모두 강조 표시"가 비활성화된 경우 첫 번째 결과만 하이라이트
      if (!this.highlightAll) {
        await this.highlightCurrentResult();
      }
    } else {
      this.searchCount.textContent = '0/0 일치';
      this.searchCount.classList.remove('hidden');
    }
  }
  
  async searchInPage(pageNum, query) {
    if (!window.pdfDoc) return;
    
    try {
      // PDF 페이지 가져오기
      const page = await window.pdfDoc.getPage(pageNum);
      
      // 텍스트 콘텐츠 가져오기
      const textContent = await page.getTextContent();
      const textItems = textContent.items;
      
      // 텍스트 아이템들을 연결하여 전체 텍스트 생성
      let fullText = '';
      textItems.forEach(item => {
        fullText += item.str + ' ';
      });
      
      // 검색 수행
      const flags = this.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const matches = [...fullText.matchAll(regex)];
      
      // 텍스트 레이어가 이미 렌더링되어 있는지 확인
      const textLayer = document.querySelector(`#page-container-${pageNum} .textLayer`);
      const isRendered = textLayer && textLayer.children.length > 0;
      
      // 모든 페이지에 대해 먼저 검색 결과를 저장
      matches.forEach(match => {
        this.searchResults.push({
          element: null,
          pageNum: pageNum,
          text: match[0],
          index: match.index,
          isUnrendered: !isRendered
        });
      });
      
      // 렌더링된 페이지인 경우 "모두 강조 표시"가 활성화된 경우에만 하이라이트 적용
      if (isRendered && this.highlightAll) {
        this.applyHighlightsToTextLayer(textLayer, query, pageNum);
      }
    } catch (error) {
      console.error(`페이지 ${pageNum} 검색 중 오류:`, error);
    }
  }
  
  applyHighlightsToTextLayer(textLayer, query, pageNum) {
    // 현재 선택된 결과가 이 페이지에 있는지 확인
    let currentMatchIndex = -1;
    if (this.currentResultIndex >= 0) {
      const current = this.searchResults[this.currentResultIndex];
      if (current && current.pageNum === pageNum) {
        // 현재 페이지의 몇 번째 매치인지 계산
        currentMatchIndex = 0;
        for (let i = 0; i < this.currentResultIndex; i++) {
          if (this.searchResults[i].pageNum === pageNum) {
            currentMatchIndex++;
          }
        }
      }
    }
    
    // 이미 하이라이트가 적용된 경우 먼저 제거
    textLayer.querySelectorAll('.highlight').forEach(el => {
      const text = el.textContent;
      const textNode = document.createTextNode(text);
      el.parentNode.replaceChild(textNode, el);
    });
    
    // 텍스트 노드들을 병합
    textLayer.normalize();
    
    const walker = document.createTreeWalker(
      textLayer,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    const flags = this.caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const nodesToReplace = [];
    
    // 먼저 모든 노드를 수집
    while (node = walker.nextNode()) {
      const text = node.textContent;
      const matches = [...text.matchAll(regex)];
      
      if (matches.length > 0) {
        nodesToReplace.push({
          node: node,
          parent: node.parentNode,
          text: text,
          matches: matches
        });
      }
    }
    
    // 수집된 노드들을 처리
    let matchCounter = 0;
    nodesToReplace.forEach(({node, parent, text, matches}) => {
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      
      matches.forEach((match) => {
        // 매치 이전 텍스트
        if (match.index > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex, match.index))
          );
        }
        
        // 매치된 텍스트를 span으로 감싸기
        const span = document.createElement('span');
        span.className = this.highlightAll ? 'highlight' : '';
        
        // 현재 선택된 매치인지 확인
        if (currentMatchIndex === matchCounter) {
          span.classList.add('current');
        }
        
        span.textContent = match[0];
        fragment.appendChild(span);
        
        matchCounter++;
        lastIndex = match.index + match[0].length;
      });
      
      // 마지막 남은 텍스트
      if (lastIndex < text.length) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex))
        );
      }
      
      // 원본 노드 교체
      parent.replaceChild(fragment, node);
    });
  }
  
  clearHighlights() {
    // 모든 하이라이트 제거
    document.querySelectorAll('.highlight, .highlight.current').forEach(el => {
      const parent = el.parentNode;
      const text = el.textContent;
      const textNode = document.createTextNode(text);
      parent.replaceChild(textNode, el);
      parent.normalize(); // 인접한 텍스트 노드 병합
    });
  }
  
  highlightSingleMatch(textLayer, query, targetIndex) {
    // 텍스트 노드들을 병합
    textLayer.normalize();
    
    const walker = document.createTreeWalker(
      textLayer,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    const flags = this.caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    let globalMatchIndex = 0;
    
    // 모든 노드를 검사하여 타겟 매치 찾기
    while (node = walker.nextNode()) {
      const text = node.textContent;
      const matches = [...text.matchAll(regex)];
      
      if (matches.length > 0) {
        // 이 노드에 타겟 매치가 있는지 확인
        for (let i = 0; i < matches.length; i++) {
          if (globalMatchIndex === targetIndex) {
            // 타겟 매치 찾음 - 이 매치만 하이라이트
            const match = matches[i];
            const parent = node.parentNode;
            const fragment = document.createDocumentFragment();
            
            // 매치 이전 텍스트
            if (match.index > 0) {
              fragment.appendChild(
                document.createTextNode(text.substring(0, match.index))
              );
            }
            
            // 매치된 텍스트를 하이라이트
            const span = document.createElement('span');
            span.className = 'highlight current';
            span.textContent = match[0];
            fragment.appendChild(span);
            
            // 매치 이후 텍스트
            if (match.index + match[0].length < text.length) {
              fragment.appendChild(
                document.createTextNode(text.substring(match.index + match[0].length))
              );
            }
            
            // 원본 노드 교체
            parent.replaceChild(fragment, node);
            
            // 하이라이트된 요소로 스크롤
            span.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
            
            return; // 타겟을 찾았으므로 종료
          }
          globalMatchIndex++;
        }
      }
    }
  }
  
  async highlightCurrentResult() {
    if (this.searchResults.length === 0) return;
    
    // 이전 current 하이라이트 제거
    document.querySelectorAll('.highlight.current').forEach(el => {
      el.classList.remove('current');
    });
    
    // "모두 강조 표시"가 비활성화된 경우 모든 하이라이트 제거
    if (!this.highlightAll) {
      this.clearHighlights();
    }
    
    // 현재 결과 가져오기
    const current = this.searchResults[this.currentResultIndex];
    if (!current) return;
    
    // 해당 페이지로 이동
    window.pageNum = current.pageNum;
    const pageNumInput = document.getElementById('page-num');
    if (pageNumInput) {
      pageNumInput.value = current.pageNum;
    }
    
    // 연속 스크롤 모드에서 해당 페이지로 스크롤
    const pageContainer = document.getElementById(`page-container-${current.pageNum}`);
    if (pageContainer) {
      pageContainer.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
    
    // 페이지 렌더링 대기
    await this.waitForPageRender(current.pageNum);
    
    // 텍스트 레이어 확인
    const textLayer = document.querySelector(`#page-container-${current.pageNum} .textLayer`);
    if (textLayer) {
      // "모두 강조 표시"가 비활성화된 경우 현재 결과만 하이라이트
      if (!this.highlightAll) {
        // 현재 페이지의 몇 번째 결과인지 찾기
        let matchIndex = 0;
        for (let i = 0; i < this.currentResultIndex; i++) {
          if (this.searchResults[i].pageNum === current.pageNum) {
            matchIndex++;
          }
        }
        
        // 현재 결과만 하이라이트
        this.highlightSingleMatch(textLayer, this.searchInput.value.trim(), matchIndex);
      } else {
        // 모두 강조 표시가 활성화된 경우
        // 먼저 현재 페이지에 하이라이트가 이미 있는지 확인
        const existingHighlights = textLayer.querySelectorAll('.highlight');
        if (existingHighlights.length === 0) {
          // 하이라이트가 없으면 적용
          this.applyHighlightsToTextLayer(textLayer, this.searchInput.value.trim(), current.pageNum);
        }
        
        // 현재 검색어의 모든 하이라이트 요소 찾기
        const highlights = textLayer.querySelectorAll('.highlight');
        let targetHighlight = null;
        let matchIndex = 0;
        
        // 현재 페이지의 몇 번째 결과인지 찾기
        for (let i = 0; i < this.currentResultIndex; i++) {
          if (this.searchResults[i].pageNum === current.pageNum) {
            matchIndex++;
          }
        }
        
        // 해당 인덱스의 하이라이트 요소 찾기
        if (highlights[matchIndex]) {
          targetHighlight = highlights[matchIndex];
          targetHighlight.classList.add('current');
          targetHighlight.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }
    }
  }
  
  async waitForPageRender(pageNum) {
    // 페이지가 렌더링될 때까지 대기
    const maxAttempts = 50;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const textLayer = document.querySelector(`#page-container-${pageNum} .textLayer`);
      if (textLayer && textLayer.children.length > 0) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }
  
  async findNext() {
    if (this.searchResults.length === 0) return;
    
    this.currentResultIndex = (this.currentResultIndex + 1) % this.searchResults.length;
    await this.highlightCurrentResult();
    this.updateSearchCount();
  }
  
  async findPrevious() {
    if (this.searchResults.length === 0) return;
    
    this.currentResultIndex = this.currentResultIndex - 1;
    if (this.currentResultIndex < 0) {
      this.currentResultIndex = this.searchResults.length - 1;
    }
    await this.highlightCurrentResult();
    this.updateSearchCount();
  }
  
  updateSearchCount() {
    if (this.searchResults.length > 0) {
      this.searchCount.textContent = `${this.currentResultIndex + 1}/${this.searchResults.length} 일치`;
      this.searchCount.classList.remove('hidden');
    } else {
      this.searchCount.classList.add('hidden');
    }
  }
  
  // Re-apply highlights after page re-rendering (e.g., after zoom)
  async reapplyHighlights() {
    if (!this.searchInput.value.trim() || this.searchResults.length === 0) return;
    
    const query = this.searchInput.value.trim();
    
    // Wait for visible pages to be rendered
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (this.highlightAll) {
      // Re-apply highlights to all visible pages
      const visiblePages = window.visiblePages || new Set();
      for (const pageNum of visiblePages) {
        const textLayer = document.querySelector(`#page-container-${pageNum} .textLayer`);
        if (textLayer && textLayer.children.length > 0) {
          this.applyHighlightsToTextLayer(textLayer, query, pageNum);
        }
      }
    }
    
    // Re-highlight the current result
    if (this.currentResultIndex >= 0 && this.currentResultIndex < this.searchResults.length) {
      await this.highlightCurrentResult();
    }
  }
  
  // 특정 페이지에 하이라이트 적용
  applyHighlightsToPage(pageNum) {
    const textLayer = document.querySelector(`#page-container-${pageNum} .textLayer`);
    if (!textLayer || textLayer.children.length === 0) return;
    
    const query = this.searchInput.value.trim();
    if (!query) return;
    
    // 이 페이지에 검색 결과가 있는지 확인
    const hasResults = this.searchResults.some(result => result.pageNum === pageNum);
    if (!hasResults) return;
    
    if (this.highlightAll) {
      // "모두 강조 표시"가 활성화된 경우 모든 매치 하이라이트
      this.applyHighlightsToTextLayer(textLayer, query, pageNum);
      
      // 현재 선택된 결과가 이 페이지에 있으면 current 클래스 추가
      if (this.currentResultIndex >= 0) {
        const current = this.searchResults[this.currentResultIndex];
        if (current.pageNum === pageNum) {
          const highlights = textLayer.querySelectorAll('.highlight');
          let matchIndex = 0;
          
          // 현재 페이지의 몇 번째 결과인지 찾기
          for (let i = 0; i < this.currentResultIndex; i++) {
            if (this.searchResults[i].pageNum === pageNum) {
              matchIndex++;
            }
          }
          
          if (highlights[matchIndex]) {
            highlights[matchIndex].classList.add('current');
          }
        }
      }
    } else if (this.currentResultIndex >= 0) {
      // "모두 강조 표시"가 비활성화되고 현재 결과가 이 페이지에 있는 경우
      const current = this.searchResults[this.currentResultIndex];
      if (current.pageNum === pageNum) {
        let matchIndex = 0;
        for (let i = 0; i < this.currentResultIndex; i++) {
          if (this.searchResults[i].pageNum === pageNum) {
            matchIndex++;
          }
        }
        this.highlightSingleMatch(textLayer, query, matchIndex);
      }
    }
  }
}

// 전역 검색 인스턴스
window.pdfSearch = new PDFSearch();