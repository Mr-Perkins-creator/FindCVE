import { useEffect } from "react";

// подключение Google Translate
export function useGoogleTranslate(lang) {
  useEffect(() => {
    if (!window.googleTranslateElementInit) {
      window.googleTranslateElementInit = () => {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: "en",
            includedLanguages: "en,ru",
            autoDisplay: false,
          },
          "google_translate_element"
        );
      };

      const script = document.createElement("script");
      script.src =
        "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      document.body.appendChild(script);
    }

    // переключение языка
    if (lang === "RU") {
      const iframe = document.querySelector("iframe.goog-te-menu-frame");
      if (iframe) {
        const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
        const russianBtn = innerDoc.querySelector(".goog-te-menu2-item span[textContent='Русский']");
        if (russianBtn) russianBtn.click();
      }
    } else {
      const iframe = document.querySelector("iframe.goog-te-menu-frame");
      if (iframe) {
        const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
        const englishBtn = innerDoc.querySelector(".goog-te-menu2-item span[textContent='Английский']");
        if (englishBtn) englishBtn.click();
      }
    }
  }, [lang]);
}
