// i18n Helper functions for Chrome Extension
// Chrome의 기본 i18n API는 확장 프로그램의 기본 locale만 사용하므로
// 사용자가 선택한 언어를 적용하려면 직접 메시지를 로드해야 합니다.

export async function getMessages(locale) {
  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
    if (!response.ok) {
      throw new Error(`Failed to load messages for locale: ${locale}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading messages:', error);
    // 오류 시 기본 한국어 메시지 로드
    const defaultResponse = await fetch(chrome.runtime.getURL('_locales/ko/messages.json'));
    return await defaultResponse.json();
  }
}

export function getMessage(messages, key, substitutions = []) {
  const messageObj = messages[key];
  if (!messageObj || !messageObj.message) {
    return key; // 키가 없으면 키 자체를 반환
  }
  
  let message = messageObj.message;
  
  // 치환 문자열 처리 ($1, $2 등)
  if (substitutions.length > 0) {
    substitutions.forEach((sub, index) => {
      const placeholder = `$${index + 1}`;
      message = message.replace(new RegExp(`\\${placeholder}`, 'g'), sub);
    });
  }
  
  return message;
}

export async function applyI18n(locale) {
  const messages = await getMessages(locale);
  
  // data-i18n 속성을 가진 모든 요소의 텍스트 내용을 번역
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const messageKey = element.getAttribute('data-i18n');
    const message = getMessage(messages, messageKey);
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      // input 요소는 value 속성 설정
      if (element.type === 'button' || element.type === 'submit') {
        element.value = message;
      }
    } else {
      element.textContent = message;
    }
  });
  
  // data-i18n-placeholder 속성을 가진 모든 요소의 placeholder를 번역
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const messageKey = element.getAttribute('data-i18n-placeholder');
    element.placeholder = getMessage(messages, messageKey);
  });
  
  // data-i18n-title 속성을 가진 모든 요소의 title을 번역
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const messageKey = element.getAttribute('data-i18n-title');
    element.title = getMessage(messages, messageKey);
  });
  
  // document title 업데이트
  const titleElement = document.querySelector('title');
  if (titleElement && titleElement.hasAttribute('data-i18n')) {
    const messageKey = titleElement.getAttribute('data-i18n');
    document.title = getMessage(messages, messageKey);
  }
}

// 현재 저장된 언어 설정을 가져와서 적용
export async function initializeI18n() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['language'], async (result) => {
      const locale = result.language || chrome.i18n.getUILanguage().substring(0, 2);
      await applyI18n(locale);
      resolve(locale);
    });
  });
}