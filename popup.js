import { GoogleGenerativeAI } from './lib/google-generative-ai.esm.js';

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyButton = document.getElementById('saveKey');
  const summarizeButton = document.getElementById('summarizeBtn');
  const translateButton = document.getElementById('translateBtn');
  const resultDiv = document.getElementById('result-container');
  const loader = document.getElementById('loader');
  const targetLangSelect = document.getElementById('targetLang');
  const themeToggleButton = document.getElementById('themeToggle');
  const themeIcon = themeToggleButton.querySelector('.material-symbols-rounded');

  // 저장된 API 키 로드
  chrome.storage.local.get(['geminiApiKey', 'theme'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }

    // 테마 설정 로드 및 적용
    if (result.theme === 'dark') {
      document.documentElement.classList.add('dark-mode');
      themeIcon.textContent = 'light_mode'; // 다크모드에서는 해 아이콘
    } else {
      document.documentElement.classList.remove('dark-mode');
      themeIcon.textContent = 'dark_mode'; // 라이트모드에서는 달 아이콘
    }
  });

  // 테마 토글 버튼 이벤트 리스너
  themeToggleButton.addEventListener('click', () => {
    const isDarkMode = document.documentElement.classList.toggle('dark-mode');

    // 아이콘 변경
    themeIcon.textContent = isDarkMode ? 'light_mode' : 'dark_mode';

    // 설정 저장
    chrome.storage.local.set({ theme: isDarkMode ? 'dark' : 'light' });
  });

  // API 키 저장
  saveKeyButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        displayMessage('API 키가 저장되었습니다.', 'success');
      });
    } else {
      displayMessage('API 키를 입력해주세요.', 'error');
    }
  });

  summarizeButton.addEventListener('click', () => handleAction('summarize'));
  translateButton.addEventListener('click', () => handleAction('translate'));

  function displayMessage(message, type = 'info') {
    // 간단한 메시지 표시 (결과창 활용 또는 별도 공간)
    // 여기서는 resultDiv 상단에 임시로 표시하는 방식을 사용하거나,
    // 혹은 alert 대신 사용할 수 있는 좀 더 나은 UI 요소가 필요합니다.
    // 지금은 console에만 표시하고, resultDiv 초기화
    console.log(`[${type.toUpperCase()}] ${message}`);
    if (type === 'error') {
      resultDiv.innerHTML = `<p class="error-message">${message}</p>`;
    } else if (type === 'success' && resultDiv.textContent.includes('결과가 여기에 표시됩니다.')) {
      // 성공 메시지는 결과가 없을 때만 간략히 표시
      resultDiv.innerHTML = `<p>${message}</p>`;
    }
    // 필요시 더 정교한 알림 시스템 구현
  }


  async function handleAction(actionType) {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      displayMessage('오류: Gemini API 키를 먼저 입력하고 저장해주세요.', 'error');
      return;
    }

    showLoader(true);
    resultDiv.innerHTML = ''; // 이전 결과 초기화

    try {
      const pageContent = await getCurrentPageContentWithReadability();
      if (!pageContent || pageContent.trim().length === 0) {
        displayMessage('오류: 페이지 내용을 추출할 수 없거나 내용이 없습니다. 다른 페이지에서 시도해 보세요.', 'error');
        showLoader(false);
        return;
      }

      let prompt;
      const targetLanguage = targetLangSelect.value;

      if (actionType === 'summarize') {
        prompt = `다음 텍스트를 한국어로 핵심 내용을 중심으로 간결하게 요약해줘. 원문의 중요한 정보를 빠뜨리지 않도록 해줘. :\n\n${pageContent}`;
      } else if (actionType === 'translate') {
        prompt = `다음 텍스트를 ${targetLanguage}(으)로 번역해줘. 웹 페이지 전체 내용이므로, 문맥을 유지하고 자연스럽게 번역해줘. HTML 태그나 코드는 번역 결과에 포함하지 마.:\n\n${pageContent}`;
      }

      await callGeminiApiStreaming(apiKey, prompt, resultDiv);

    } catch (error) {
      console.error('Error in handleAction:', error);
      displayMessage(`오류 발생: ${error.message}`, 'error');
    } finally {
      showLoader(false);
    }
  }

  async function getCurrentPageContentWithReadability() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
          reject(new Error("활성 탭을 찾을 수 없습니다."));
          return;
        }
        const tabId = tabs[0].id;

        try {
          // Readability.js 주입 확인 (이미 주입되었다면 다시 주입하지 않도록 할 수도 있으나, 여기서는 매번 주입)
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['lib/Readability.js']
          });

          const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              try {
                // 현재 문서의 복사본을 만들어 Readability에 전달
                const documentClone = document.cloneNode(true);
                // Readability 생성자에 두 번째 인자로 옵션 객체를 전달할 수 있습니다.
                // 예: { debug: false, maxElemsToParse: 0, nbTopCandidates: 5, charThreshold: 500 }
                // 옵션 문서는 Readability.js 소스코드나 관련 문서를 참고하세요.
                const article = new Readability(documentClone).parse();
                return article && article.textContent ? article.textContent : document.body.innerText; // article.content는 HTML
              } catch (e) {
                console.error("Readability 실행 중 오류:", e);
                return document.body.innerText; // 실패 시 fallback
              }
            }
          });

          if (chrome.runtime.lastError) {
            console.error("Scripting error:", chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (injectionResults && injectionResults[0] && injectionResults[0].result) {
            resolve(injectionResults[0].result);
          } else {
            // Readability가 아무것도 반환하지 못한 경우 (예: 빈 페이지, 애플리케이션 페이지)
            // document.body.innerText로 다시 시도 (위의 func에서 이미 fallback 처리됨)
            const fallbackResults = await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => document.body.innerText || ""
            });
            resolve(fallbackResults[0].result);
          }
        } catch (error) {
          console.error("Readability 주입 또는 실행 중 오류:", error);
          // 최종 fallback
          try {
            const fallbackResults = await chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: () => document.body.innerText || ""
            });
            resolve(fallbackResults[0].result);
          } catch (finalError) {
            reject(finalError);
          }
        }
      });
    });
  }

  async function callGeminiApiStreaming(apiKey, promptText, resultElement) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      // 시스템 지시(System Instruction)를 사용하여 모델의 행동 양식이나 역할을 미리 정의할 수 있습니다.
      // systemInstruction: "당신은 유능한 번역가이자 요약 전문가입니다.",
    });


    resultElement.innerHTML = ''; // 이전 결과 초기화

    try {
      const generationConfig = {
        // temperature: 0.7, // 창의성 조절 (0.0 ~ 1.0)
        // topK: 1,
        // topP: 1,
        maxOutputTokens: 8192, // 최대 출력 토큰 수
      };

      const streamResult = await model.generateContentStream({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig,
      });

      let accumulatedText = "";
      for await (const chunk of streamResult.stream) {
        if (chunk && chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts && chunk.candidates[0].content.parts[0]) {
          const chunkText = chunk.candidates[0].content.parts[0].text;
          accumulatedText += chunkText;
          resultElement.textContent = accumulatedText; // 전체 텍스트를 계속 업데이트
          resultElement.scrollTop = resultElement.scrollHeight; // 자동 스크롤
        }
      }
      if (accumulatedText.trim() === "") {
        resultElement.textContent = "API로부터 응답을 받았으나 내용이 비어있습니다. 프롬프트를 확인하거나 다른 내용을 시도해보세요.";
      }

    } catch (error) {
      console.error("Gemini API 스트리밍 중 에러:", error);
      let errorMessage = `API 스트리밍 오류: ${error.message || '알 수 없는 오류'}`;
      // Gemini API는 오류 응답에 상세 정보를 포함할 수 있습니다.
      if (error.cause && error.cause.message) { // 실제 오류 구조는 API 문서를 확인하세요.
        errorMessage += `\n세부 정보: ${error.cause.message}`;
      }
      resultElement.innerHTML = `<p class="error-message">${errorMessage}</p>`;
      throw error; // 에러를 다시 throw하여 handleAction에서 잡도록 함
    }
  }

  function showLoader(show) {
    loader.style.display = show ? 'block' : 'none';
    // 로더가 보일 때는 버튼 비활성화
    summarizeButton.disabled = show;
    translateButton.disabled = show;
  }
});