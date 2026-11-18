(function () {
  "use strict";

  const LANGUAGES = ["ru", "et", "en"];
  const NEXT_BY_LANGUAGE = Object.freeze({
    ru: "/schedule/",
    et: "/schedule/et/",
    en: "/schedule/en/"
  });
  const ALLOWED_NEXT = new Set(Object.values(NEXT_BY_LANGUAGE));
  const HOME_BY_LANGUAGE = Object.freeze({ ru: "/", et: "/et/", en: "/en/" });

  const COPY = Object.freeze({
    ru: {
      title: "Вход в редактор расписания — DZHIKAEVA",
      description: "Вход в защищённый редактор расписания.",
      skip: "Перейти к форме входа",
      brandHome: "На главную",
      languageLabel: "Язык страницы",
      languageRu: "Русский",
      languageEt: "Эстонский",
      languageEn: "Английский",
      eyebrow: "ПАНЕЛЬ РАСПИСАНИЯ",
      titleLineOne: "РАСПИСАНИЕ",
      titleLineTwo: "ПОД КОНТРОЛЕМ",
      intro: "Создание, перенос и обновление занятий — всё расписание в одном месте.",
      security: "Данные для входа проверяются защищённо и не хранятся на этой странице.",
      cardEyebrow: "ТОЛЬКО ДЛЯ ТРЕНЕРА",
      formTitle: "РЕДАКТОР РАСПИСАНИЯ",
      formText: "Введите логин и пароль.",
      checking: "Проверяем вход…",
      username: "Логин",
      password: "Пароль",
      showPassword: "Показать пароль",
      hidePassword: "Скрыть пароль",
      submit: "ВОЙТИ В РЕДАКТОР",
      submitting: "ПРОВЕРЯЕМ…",
      invalidFields: "Введите логин и пароль.",
      invalidCredentials: "Неверный логин или пароль.",
      rateLimited: "Слишком много попыток. Подождите немного и попробуйте снова.",
      networkError: "Нет соединения с сервером. Проверьте интернет и попробуйте снова.",
      serverError: "Не удалось войти. Попробуйте ещё раз.",
      sessionUnavailable: "Не удалось проверить текущий вход. Можно войти заново.",
      alreadyTitle: "ДОСТУП ПОДТВЕРЖДЁН",
      openEditor: "ОТКРЫТЬ РЕДАКТОР",
      backHome: "Вернуться на сайт",
      footer: "ЗАЩИЩЁННАЯ ПАНЕЛЬ"
    },
    et: {
      title: "Tunniplaani haldusse sisselogimine — DZHIKAEVA",
      description: "Sisselogimine kaitstud tunniplaani haldusse.",
      skip: "Mine sisselogimisvormi juurde",
      brandHome: "Avalehele",
      languageLabel: "Lehe keel",
      languageRu: "Vene keel",
      languageEt: "Eesti keel",
      languageEn: "Inglise keel",
      eyebrow: "TUNNIPLAANI HALDUS",
      titleLineOne: "TUNNIPLAAN",
      titleLineTwo: "KONTROLLI ALL",
      intro: "Loo, tõsta ja uuenda treeninguid — kogu tunniplaan ühes kohas.",
      security: "Sisselogimisandmeid kontrollitakse turvaliselt ja neid ei salvestata sellele lehele.",
      cardEyebrow: "AINULT TREENERILE",
      formTitle: "TUNNIPLAANI HALDUS",
      formText: "Sisesta kasutajanimi ja parool.",
      checking: "Kontrollime sisselogimist…",
      username: "Kasutajanimi",
      password: "Parool",
      showPassword: "Näita parooli",
      hidePassword: "Peida parool",
      submit: "LOGI HALDUSSE",
      submitting: "KONTROLLIME…",
      invalidFields: "Sisesta kasutajanimi ja parool.",
      invalidCredentials: "Vale kasutajanimi või parool.",
      rateLimited: "Liiga palju katseid. Oota veidi ja proovi uuesti.",
      networkError: "Serveriga ei saa ühendust. Kontrolli internetiühendust ja proovi uuesti.",
      serverError: "Sisselogimine ebaõnnestus. Proovi uuesti.",
      sessionUnavailable: "Praegust sisselogimist ei saanud kontrollida. Võid uuesti sisse logida.",
      alreadyTitle: "JUURDEPÄÄS KINNITATUD",
      openEditor: "AVA HALDUS",
      backHome: "Tagasi veebilehele",
      footer: "KAITSTUD HALDUS"
    },
    en: {
      title: "Schedule editor sign in — DZHIKAEVA",
      description: "Sign in to the protected schedule editor.",
      skip: "Skip to sign-in form",
      brandHome: "Go to homepage",
      languageLabel: "Page language",
      languageRu: "Russian",
      languageEt: "Estonian",
      languageEn: "English",
      eyebrow: "SCHEDULE ADMIN",
      titleLineOne: "YOUR SCHEDULE",
      titleLineTwo: "UNDER CONTROL",
      intro: "Create, move and update sessions — keep the whole schedule in one place.",
      security: "Sign-in details are checked securely and are never stored on this page.",
      cardEyebrow: "COACH ACCESS ONLY",
      formTitle: "SCHEDULE EDITOR",
      formText: "Enter your username and password.",
      checking: "Checking your session…",
      username: "Username",
      password: "Password",
      showPassword: "Show password",
      hidePassword: "Hide password",
      submit: "SIGN IN TO EDITOR",
      submitting: "CHECKING…",
      invalidFields: "Enter your username and password.",
      invalidCredentials: "Incorrect username or password.",
      rateLimited: "Too many attempts. Wait a moment and try again.",
      networkError: "The server cannot be reached. Check your connection and try again.",
      serverError: "Sign-in failed. Please try again.",
      sessionUnavailable: "Your current sign-in could not be checked. You can sign in again.",
      alreadyTitle: "ACCESS CONFIRMED",
      openEditor: "OPEN EDITOR",
      backHome: "Return to website",
      footer: "PROTECTED ADMIN"
    }
  });

  const app = document.querySelector("[data-auth-app]");
  if (!app) return;

  const form = app.querySelector("[data-auth-form]");
  const username = form && form.elements.namedItem("username");
  const password = form && form.elements.namedItem("password");
  const submit = app.querySelector("[data-auth-submit]");
  const submitLabel = app.querySelector("[data-auth-submit-label]");
  const status = app.querySelector("[data-auth-status]");
  const sessionPanel = app.querySelector("[data-auth-session]");
  const nextLink = app.querySelector("[data-auth-next-link]");
  const languageNav = app.querySelector(".auth-languages");
  const transitionContent = app.querySelector("[data-auth-transition-content]");
  const passwordToggle = app.querySelector("[data-auth-password-toggle]");
  const descriptionMeta = document.querySelector('meta[name="description"]');
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let language = getLanguageFromUrl();
  let isSubmitting = false;

  function getLanguageFromUrl() {
    const candidate = new URL(window.location.href).searchParams.get("lang");
    return LANGUAGES.includes(candidate) ? candidate : "ru";
  }

  function safeNext(candidate, fallbackLanguage) {
    return ALLOWED_NEXT.has(candidate) ? candidate : NEXT_BY_LANGUAGE[fallbackLanguage];
  }

  function currentNext() {
    const candidate = new URL(window.location.href).searchParams.get("next") || "";
    return safeNext(candidate, language);
  }

  function copy() {
    return COPY[language];
  }

  function setStatus(message, kind) {
    if (!status) return;
    status.textContent = message || "";
    status.dataset.kind = kind || "error";
  }

  function updatePasswordToggleLabel() {
    if (!passwordToggle || !password) return;
    const isVisible = password.type === "text";
    passwordToggle.setAttribute("aria-pressed", String(isVisible));
    passwordToggle.setAttribute("aria-label", isVisible ? copy().hidePassword : copy().showPassword);
  }

  function renderLanguage() {
    const strings = copy();
    document.documentElement.lang = language;
    document.documentElement.dataset.authLanguage = language;
    document.title = strings.title;
    if (descriptionMeta) descriptionMeta.setAttribute("content", strings.description);

    document.querySelectorAll("[data-auth-i18n]").forEach(function (node) {
      const key = node.getAttribute("data-auth-i18n");
      if (Object.prototype.hasOwnProperty.call(strings, key)) node.textContent = strings[key];
    });
    document.querySelectorAll("[data-auth-i18n-aria]").forEach(function (node) {
      const key = node.getAttribute("data-auth-i18n-aria");
      if (Object.prototype.hasOwnProperty.call(strings, key)) node.setAttribute("aria-label", strings[key]);
    });
    document.querySelectorAll("[data-auth-home-link]").forEach(function (link) {
      link.setAttribute("href", HOME_BY_LANGUAGE[language]);
    });
    document.querySelectorAll("[data-auth-language-button]").forEach(function (button) {
      const active = button.getAttribute("data-auth-language-button") === language;
      button.setAttribute("aria-pressed", String(active));
    });
    if (languageNav) languageNav.dataset.activeLanguage = language;
    if (nextLink) nextLink.setAttribute("href", currentNext());
    if (isSubmitting && submitLabel) submitLabel.textContent = strings.submitting;
    updatePasswordToggleLabel();
  }

  function updateUrl(mode) {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", language);
    url.searchParams.set("next", NEXT_BY_LANGUAGE[language]);
    window.history[mode + "State"]({ language: language }, "", url.pathname + url.search + url.hash);
  }

  function chooseLanguage(nextLanguage, historyMode) {
    if (!LANGUAGES.includes(nextLanguage)) return;
    const changed = nextLanguage !== language;
    language = nextLanguage;
    updateUrl(historyMode || "push");

    if (!changed || prefersReducedMotion.matches || !transitionContent) {
      renderLanguage();
      return;
    }

    transitionContent.classList.add("is-language-changing");
    window.setTimeout(function () {
      renderLanguage();
      window.requestAnimationFrame(function () {
        transitionContent.classList.remove("is-language-changing");
      });
    }, 130);
  }

  function setSessionState(state, message) {
    app.dataset.sessionState = state;
    if (sessionPanel) sessionPanel.hidden = state !== "authenticated";
    if (state === "login" && message) setStatus(message, "info");
    if (state === "login" && !message) setStatus("");
  }

  async function clearLegacyScheduleCache() {
    const jobs = [];
    if ("serviceWorker" in navigator) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (registrations) {
        return Promise.all(registrations.map(function (registration) {
          try {
            const scopePath = new URL(registration.scope).pathname;
            const scriptUrl = registration.active && registration.active.scriptURL;
            const isScheduleWorker = scopePath.indexOf("/schedule/") === 0 || (scriptUrl && new URL(scriptUrl).pathname === "/schedule/sw.js");
            return isScheduleWorker ? registration.unregister() : false;
          } catch (error) {
            return false;
          }
        }));
      }));
    }
    if ("caches" in window) {
      jobs.push(window.caches.keys().then(function (names) {
        return Promise.all(names.filter(function (name) {
          return name.indexOf("aleksi-schedule-") === 0;
        }).map(function (name) {
          return window.caches.delete(name);
        }));
      }));
    }
    await Promise.allSettled(jobs);
  }

  async function checkSession() {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      const data = response.ok ? await response.json().catch(function () { return {}; }) : {};
      if (data.authenticated === true) {
        setSessionState("authenticated");
        window.location.replace(currentNext());
        return;
      }
      setSessionState("login");
    } catch (error) {
      setSessionState("login", copy().sessionUnavailable);
    }
  }

  function setSubmitting(pending) {
    isSubmitting = pending;
    if (form) form.setAttribute("aria-busy", String(pending));
    if (submit) submit.disabled = pending;
    if (username) username.readOnly = pending;
    if (password) password.readOnly = pending;
    if (submitLabel) submitLabel.textContent = pending ? copy().submitting : copy().submit;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!form || isSubmitting || !username || !password) return;

    username.removeAttribute("aria-invalid");
    password.removeAttribute("aria-invalid");
    setStatus("");

    const loginValue = username.value.trim();
    const passwordValue = password.value;
    if (!loginValue || !passwordValue) {
      if (!loginValue) username.setAttribute("aria-invalid", "true");
      if (!passwordValue) password.setAttribute("aria-invalid", "true");
      setStatus(copy().invalidFields);
      (!loginValue ? username : password).focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: loginValue, password: passwordValue })
      });
      const data = await response.json().catch(function () { return {}; });

      if (response.ok && (data.authenticated === true || data.ok === true)) {
        password.value = "";
        window.location.replace(currentNext());
        return;
      }

      password.value = "";
      password.setAttribute("aria-invalid", "true");
      if (response.status === 401 || response.status === 403) setStatus(copy().invalidCredentials);
      else if (response.status === 429) setStatus(copy().rateLimited);
      else setStatus(copy().serverError);
      password.focus();
    } catch (error) {
      setStatus(copy().networkError);
    } finally {
      setSubmitting(false);
    }
  }

  document.querySelectorAll("[data-auth-language-button]").forEach(function (button) {
    button.addEventListener("click", function () {
      chooseLanguage(button.getAttribute("data-auth-language-button"), "push");
    });
  });

  if (passwordToggle && password) {
    passwordToggle.addEventListener("click", function () {
      password.type = password.type === "password" ? "text" : "password";
      updatePasswordToggleLabel();
      password.focus();
    });
  }

  if (form) form.addEventListener("submit", onSubmit);
  if (username) username.addEventListener("input", function () { username.removeAttribute("aria-invalid"); });
  if (password) password.addEventListener("input", function () { password.removeAttribute("aria-invalid"); });

  window.addEventListener("popstate", function () {
    language = getLanguageFromUrl();
    renderLanguage();
  });

  updateUrl("replace");
  renderLanguage();
  clearLegacyScheduleCache();
  checkSession();
}());
