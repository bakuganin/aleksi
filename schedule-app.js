(function () {
  "use strict";

  var store = window.DzhikaevaSchedule;
  var dates = window.DzhikaevaScheduleDates;
  var app = document.querySelector("[data-schedule-app]");
  if (!store || !dates || !app) return;

  var language = "ru";
  var editingId = "";
  var editingTemplateId = "";
  var placementTemplateId = "";
  var formMode = "session";
  var editingTemplateDuration = 60;
  var deferredInstallPrompt = null;
  var statusTimer = 0;
  var syncLockedCalendar = app.querySelector("[data-schedule-calendar-editable]");
  var syncLockedManageButton = app.querySelector("[data-schedule-open-manage]");
  var sessionDialogOpener = null;
  var manageDialogOpener = null;
  var sessionReturnToManage = false;
  var sessionManageFocusTarget = null;
  var suppressedDialogRestores = [];
  var scrollLockState = null;
  var customSelectControllers = [];
  var openCustomSelectController = null;
  var customSelectCounter = 0;
  var CUSTOM_SELECT_CLOSE_DURATION = 180;
  var LANGUAGE_PATHS = { ru: "/schedule/", et: "/schedule/et/", en: "/schedule/en/" };
  var HOME_PATHS = { ru: "/", et: "/et/", en: "/en/" };
  if (syncLockedCalendar) syncLockedCalendar.setAttribute("inert", "");
  if (syncLockedManageButton) syncLockedManageButton.disabled = true;
  var PRESETS = {
    "sillamae-children": {
      venue: "sillamae",
      title: { ru: "Дети и подростки", et: "Lapsed ja noored", en: "Children and teenagers" },
      audience: { ru: "6–16 лет", et: "6–16-aastased", en: "Ages 6–16" }
    },
    "sillamae-toddlers": {
      venue: "sillamae",
      title: { ru: "Первое знакомство", et: "Esimene tutvus", en: "First introduction" },
      audience: { ru: "Малыши до 4 лет", et: "Väikelapsed kuni 4 aastat", en: "Toddlers up to age 4" }
    },
    "narva-children": {
      venue: "narva",
      title: { ru: "Детская группа", et: "Lasterühm", en: "Children’s group" },
      audience: { ru: "От 5–6 лет", et: "Alates 5.–6. eluaastast", en: "Ages 5–6 and up" }
    }
  };
  var DAY_NAMES = {
    ru: ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
    et: ["", "E", "T", "K", "N", "R", "L", "P"],
    en: ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  };
  var COPY = {
    ru: {
      "skip": "Перейти к содержанию",
      "brand.home": "На главную",
      "brand.caption": "Расписание",
      "nav.home": "Главная",
      "auth.logout": "Выйти",
      "auth.logoutAria": "Выйти из панели",
      "auth.checkFailed": "Не удалось проверить вход. Локальная работа сохранена; проверьте соединение и попробуйте ещё раз.",
      "auth.loggingOut": "Выходим из панели…",
      "auth.logoutFailed": "Не удалось выйти. Проверьте соединение и повторите попытку.",
      "language.label": "Язык страницы",
      "language.ru": "Русский",
      "language.et": "Эстонский",
      "language.en": "Английский",
      "tabs.label": "Режим страницы",
      "filter.label": "Фильтр по залу",
      "day.1": "Понедельник",
      "day.2": "Вторник",
      "day.3": "Среда",
      "day.4": "Четверг",
      "day.5": "Пятница",
      "day.6": "Суббота",
      "day.7": "Воскресенье",
      "hero.eyebrow": "KONKIRO · ТАЛЛИННСКОЕ ВРЕМЯ",
      "hero.title": "РАСПИСАНИЕ ТРЕНИРОВОК",
      "hero.text": "Создавайте, переносите и обновляйте занятия — изменения сразу появятся в расписании на сайте.",
      "hero.install": "Добавить на экран",
      "hero.installed": "Приложение установлено",
      "tabs.schedule": "Календарь",
      "tabs.editor": "Редактор",
      "modal.close": "Закрыть окно",
      "modal.back": "Вернуться к управлению расписанием",
      "modal.manage": "Управление расписанием",
      "modal.delete": "Удалить занятие",
      "modal.deleteTemplate": "Удалить шаблон",
      "public.eyebrow": "НЕДЕЛЬНОЕ РАСПИСАНИЕ",
      "public.title": "КАЛЕНДАРЬ ЗАНЯТИЙ",
      "filter.sillamae": "Силламяэ",
      "filter.narva": "Нарва",
      "calendar.label": "Недельный календарь занятий",
      "calendar.hint": "Перетаскивайте карточки за маркер, чтобы изменить день и время. Нажмите на карточку для редактирования или на свободное время для создания занятия.",
      "calendar.add": "Создать занятие",
      "calendar.loading": "Готовим календарь…",
      "timezone": "Время указано по часовому поясу Europe/Tallinn.",
      "editor.eyebrow": "ЗАЩИЩЁННАЯ ПАНЕЛЬ",
      "editor.title": "УПРАВЛЕНИЕ РАСПИСАНИЕМ",
      "form.title": "Занятие",
      "form.new": "Новое занятие",
      "form.templateNew": "Новый шаблон",
      "form.templateEdit": "Редактировать шаблон",
      "form.templateHint": "Шаблон — это готовая группа без даты и времени. Перетащите его в календарь, чтобы выбрать время и повторение. Уже добавленные занятия при изменении шаблона не меняются.",
      "form.duration": "Длительность, минут",
      "form.day": "Основной день",
      "form.recurrence": "Повторение",
      "form.repeatWeekly": "Повторять каждую неделю",
      "form.repeatHint": "Отметьте все дни, в которые проходит это занятие.",
      "form.repeatDays": "Дни повторения",
      "form.startsOn": "Начать с даты",
      "form.endsOn": "Закончить (необязательно)",
      "form.onceDate": "Дата занятия",
      "form.weekly": "каждую неделю",
      "form.once": "один раз",
      "day.short.1": "Пн",
      "day.short.2": "Вт",
      "day.short.3": "Ср",
      "day.short.4": "Чт",
      "day.short.5": "Пт",
      "day.short.6": "Сб",
      "day.short.7": "Вс",
      "form.start": "Начало",
      "form.end": "Конец",
      "form.venue": "Зал",
      "form.status": "Статус",
      "form.active": "Активно",
      "form.cancelled": "Приостановлено",
      "form.preset": "Готовая группа",
      "form.presetCustom": "Другая / вручную",
      "form.presetSillamaeChildren": "Силламяэ · дети 6–16",
      "form.presetSillamaeToddlers": "Силламяэ · малыши до 4",
      "form.presetNarvaChildren": "Нарва · от 5–6 лет",
      "form.languages": "Тексты на трёх языках",
      "form.nameLegend": "Название",
      "form.audienceLegend": "Возраст / группа",
      "form.sillamae": "Силламяэ · Kalda 14",
      "form.narva": "Нарва · Rakvere 22D",
      "form.titleRu": "Название · RU",
      "form.titleEt": "Название · ET",
      "form.titleEn": "Название · EN",
      "form.audienceRu": "Возраст / группа · RU",
      "form.audienceEt": "Возраст / группа · ET",
      "form.audienceEn": "Возраст / группа · EN",
      "form.placementGroup": "Группа",
      "form.save": "Сохранить занятие",
      "form.placeTemplate": "Добавить в расписание",
      "form.saveTemplate": "Сохранить шаблон",
      "list.title": "Занятия в расписании",
      "actions.edit": "Изменить",
      "actions.delete": "Удалить",
      "actions.cancelled": "приостановлено",
      "actions.undo": "Отменить",
      "tools.title": "Резервная копия",
      "tools.text": "Экспортируйте JSON перед крупными изменениями. Импорт проверяется до сохранения.",
      "tools.export": "Экспорт JSON",
      "tools.restore": "Вернуть резервную копию",
      "tools.reset": "Вернуть исходное",
      "tools.importLabel": "JSON для импорта",
      "tools.importPlaceholder": "Вставьте экспортированный JSON сюда",
      "tools.importText": "Импортировать текст",
      "tools.importFile": "Или выбрать JSON-файл",
      "install.ios": "На iPhone: нажмите «Поделиться», затем «На экран Домой».",
      "install.generic": "Откройте меню браузера и выберите «Добавить на главный экран».",
      "status.saved": "Занятие сохранено.",
      "status.templateSaved": "Шаблон сохранён.",
      "status.moved": "Занятие перенесено.",
      "status.undone": "Перенос отменён.",
      "status.deleted": "Занятие удалено.",
      "status.templateDeleted": "Шаблон удалён.",
      "status.imported": "Расписание импортировано.",
      "status.exported": "Файл экспорта подготовлен.",
      "status.reset": "Исходное расписание восстановлено. Предыдущая версия сохранена в резервной копии.",
      "status.restored": "Резервная копия восстановлена.",
      "status.installing": "Открываем установку приложения…",
      "status.update": "Обновление приложения будет доступно после следующего запуска.",
      "sync.saving": "Сохраняем изменения в общей базе…",
      "sync.synced": "Изменения опубликованы для всех устройств.",
      "sync.offline": "Нет связи с общей базой. Изменения сохранены на этом устройстве и будут отправлены после восстановления сети.",
      "sync.error": "Не удалось синхронизировать расписание. Локальная копия сохранена.",
      "sync.conflict": "Расписание уже изменили на другом устройстве. Выберите, какую версию оставить.",
      "sync.retry": "Повторить",
      "sync.useCloud": "Загрузить общую",
      "sync.useLocal": "Оставить эту",
      "confirm.delete": "Удалить это занятие?",
      "confirm.deleteTemplate": "Удалить этот шаблон? Уже созданные по нему занятия останутся в календаре.",
      "confirm.reset": "Вернуть подтверждённое исходное расписание? Текущая версия будет сохранена как резервная копия.",
      "confirm.restore": "Заменить текущее расписание последней резервной копией?",
      "error.prefix": "Не удалось выполнить действие: ",
      "error.storage": "Браузер не разрешил сохранить данные. Расписание не изменено. Проверьте свободное место и настройки приватности."
    },
    et: {
      "skip": "Liigu sisu juurde",
      "brand.home": "Avalehele",
      "brand.caption": "Tunniplaan",
      "nav.home": "Avaleht",
      "auth.logout": "Logi välja",
      "auth.logoutAria": "Logi halduspaneelist välja",
      "auth.checkFailed": "Sisselogimist ei saanud kontrollida. Kohalik töö on alles; kontrolli ühendust ja proovi uuesti.",
      "auth.loggingOut": "Logime halduspaneelist välja…",
      "auth.logoutFailed": "Väljalogimine ebaõnnestus. Kontrolli ühendust ja proovi uuesti.",
      "language.label": "Lehe keel",
      "language.ru": "Vene",
      "language.et": "Eesti",
      "language.en": "Inglise",
      "tabs.label": "Lehe vaade",
      "filter.label": "Saali filter",
      "day.1": "Esmaspäev",
      "day.2": "Teisipäev",
      "day.3": "Kolmapäev",
      "day.4": "Neljapäev",
      "day.5": "Reede",
      "day.6": "Laupäev",
      "day.7": "Pühapäev",
      "hero.eyebrow": "KONKIRO · TALLINNA AEG",
      "hero.title": "TREENINGUTE TUNNIPLAAN",
      "hero.text": "Loo, tõsta ja uuenda treeninguid — muudatused ilmuvad kohe veebilehe tunniplaanis.",
      "hero.install": "Lisa avaekraanile",
      "hero.installed": "Rakendus on paigaldatud",
      "tabs.schedule": "Kalender",
      "tabs.editor": "Redaktor",
      "modal.close": "Sulge aken",
      "modal.back": "Tagasi tunniplaani haldusse",
      "modal.manage": "Halda tunniplaani",
      "modal.delete": "Kustuta treening",
      "modal.deleteTemplate": "Kustuta mall",
      "public.eyebrow": "NÄDALA TUNNIPLAAN",
      "public.title": "TREENINGUTE KALENDER",
      "filter.sillamae": "Sillamäe",
      "filter.narva": "Narva",
      "calendar.label": "Nädala treeningute kalender",
      "calendar.hint": "Treeningu päeva ja kellaaja muutmiseks lohista kaarti käepidemest. Muutmiseks puuduta kaarti või uue treeningu lisamiseks vaba aega.",
      "calendar.add": "Lisa treening",
      "calendar.loading": "Koostame kalendrit…",
      "timezone": "Ajad on näidatud Europe/Tallinn ajavööndis.",
      "editor.eyebrow": "KAITSTUD HALDUSPANEEL",
      "editor.title": "TUNNIPLAANI HALDAMINE",
      "form.title": "Treening",
      "form.new": "Uus treening",
      "form.templateNew": "Uus mall",
      "form.templateEdit": "Muuda malli",
      "form.templateHint": "Mall on valmis rühm ilma kuupäeva ja kellaajata. Lohista see kalendrisse, et valida aeg ja kordumine. Malli muutmine ei muuda juba lisatud treeninguid.",
      "form.duration": "Kestus minutites",
      "form.day": "Põhipäev",
      "form.recurrence": "Kordumine",
      "form.repeatWeekly": "Korda igal nädalal",
      "form.repeatHint": "Märgi kõik päevad, mil see treening toimub.",
      "form.repeatDays": "Korduspäevad",
      "form.startsOn": "Alguskuupäev",
      "form.endsOn": "Lõpp (valikuline)",
      "form.onceDate": "Treeningu kuupäev",
      "form.weekly": "igal nädalal",
      "form.once": "üks kord",
      "day.short.1": "E",
      "day.short.2": "T",
      "day.short.3": "K",
      "day.short.4": "N",
      "day.short.5": "R",
      "day.short.6": "L",
      "day.short.7": "P",
      "form.start": "Algus",
      "form.end": "Lõpp",
      "form.venue": "Saal",
      "form.status": "Olek",
      "form.active": "Aktiivne",
      "form.cancelled": "Peatatud",
      "form.preset": "Valmis rühm",
      "form.presetCustom": "Muu / käsitsi",
      "form.presetSillamaeChildren": "Sillamäe · lapsed 6–16",
      "form.presetSillamaeToddlers": "Sillamäe · kuni 4-aastased",
      "form.presetNarvaChildren": "Narva · alates 5.–6. eluaastast",
      "form.languages": "Tekstid kolmes keeles",
      "form.nameLegend": "Nimetus",
      "form.audienceLegend": "Vanus / rühm",
      "form.sillamae": "Sillamäe · Kalda 14",
      "form.narva": "Narva · Rakvere 22D",
      "form.titleRu": "Nimetus · RU",
      "form.titleEt": "Nimetus · ET",
      "form.titleEn": "Nimetus · EN",
      "form.audienceRu": "Vanus / rühm · RU",
      "form.audienceEt": "Vanus / rühm · ET",
      "form.audienceEn": "Vanus / rühm · EN",
      "form.placementGroup": "Rühm",
      "form.save": "Salvesta treening",
      "form.placeTemplate": "Lisa tunniplaani",
      "form.saveTemplate": "Salvesta mall",
      "list.title": "Tunniplaani treeningud",
      "actions.edit": "Muuda",
      "actions.delete": "Kustuta",
      "actions.cancelled": "peatatud",
      "actions.undo": "Võta tagasi",
      "tools.title": "Varukoopia",
      "tools.text": "Ekspordi JSON enne suuri muudatusi. Importi kontrollitakse enne salvestamist.",
      "tools.export": "Ekspordi JSON",
      "tools.restore": "Taasta varukoopia",
      "tools.reset": "Taasta algseis",
      "tools.importLabel": "Imporditav JSON",
      "tools.importPlaceholder": "Kleebi eksporditud JSON siia",
      "tools.importText": "Impordi tekst",
      "tools.importFile": "Või vali JSON-fail",
      "install.ios": "iPhone'is vajuta „Jaga“ ja seejärel „Lisa avaekraanile“.",
      "install.generic": "Ava brauseri menüü ja vali „Lisa avaekraanile“.",
      "status.saved": "Treening on salvestatud.",
      "status.templateSaved": "Mall on salvestatud.",
      "status.moved": "Treening on ümber tõstetud.",
      "status.undone": "Teisaldamine on tagasi võetud.",
      "status.deleted": "Treening on kustutatud.",
      "status.templateDeleted": "Mall on kustutatud.",
      "status.imported": "Tunniplaan on imporditud.",
      "status.exported": "Ekspordifail on valmis.",
      "status.reset": "Algne tunniplaan on taastatud. Eelmine versioon salvestati varukoopiana.",
      "status.restored": "Varukoopia on taastatud.",
      "status.installing": "Avame rakenduse paigalduse…",
      "status.update": "Rakenduse uuendus on saadaval pärast järgmist käivitamist.",
      "sync.saving": "Salvestame muudatusi ühisesse andmebaasi…",
      "sync.synced": "Muudatused on avaldatud kõigis seadmetes.",
      "sync.offline": "Ühise andmebaasiga ei ole ühendust. Muudatused on selles seadmes alles ja saadetakse võrgu taastumisel.",
      "sync.error": "Tunniplaani sünkroonimine ebaõnnestus. Kohalik koopia on alles.",
      "sync.conflict": "Tunniplaani muudeti teises seadmes. Vali, milline versioon alles jätta.",
      "sync.retry": "Proovi uuesti",
      "sync.useCloud": "Laadi ühine",
      "sync.useLocal": "Jäta see",
      "confirm.delete": "Kas kustutada see treening?",
      "confirm.deleteTemplate": "Kas kustutada see mall? Selle alusel juba loodud treeningud jäävad kalendrisse.",
      "confirm.reset": "Kas taastada kinnitatud algne tunniplaan? Praegune versioon salvestatakse varukoopiana.",
      "confirm.restore": "Kas asendada praegune tunniplaan viimase varukoopiaga?",
      "error.prefix": "Toiming ebaõnnestus: ",
      "error.storage": "Brauser ei lubanud andmeid salvestada. Tunniplaani ei muudetud. Kontrolli vaba ruumi ja privaatsusseadeid."
    },
    en: {
      "skip": "Skip to content",
      "brand.home": "Home",
      "brand.caption": "Schedule",
      "nav.home": "Home",
      "auth.logout": "Log out",
      "auth.logoutAria": "Log out of the control panel",
      "auth.checkFailed": "We could not verify your session. Your local work is safe; check the connection and try again.",
      "auth.loggingOut": "Logging out of the control panel…",
      "auth.logoutFailed": "Could not log out. Check the connection and try again.",
      "language.label": "Page language",
      "language.ru": "Russian",
      "language.et": "Estonian",
      "language.en": "English",
      "tabs.label": "Page view",
      "filter.label": "Gym filter",
      "day.1": "Monday",
      "day.2": "Tuesday",
      "day.3": "Wednesday",
      "day.4": "Thursday",
      "day.5": "Friday",
      "day.6": "Saturday",
      "day.7": "Sunday",
      "hero.eyebrow": "KONKIRO · TALLINN TIME",
      "hero.title": "TRAINING SCHEDULE",
      "hero.text": "Create, move and update sessions — changes appear in the website schedule immediately.",
      "hero.install": "Add to Home Screen",
      "hero.installed": "App installed",
      "tabs.schedule": "Calendar",
      "tabs.editor": "Editor",
      "modal.close": "Close dialog",
      "modal.back": "Return to schedule management",
      "modal.manage": "Manage schedule",
      "modal.delete": "Delete session",
      "modal.deleteTemplate": "Delete template",
      "public.eyebrow": "WEEKLY SCHEDULE",
      "public.title": "TRAINING CALENDAR",
      "filter.sillamae": "Sillamäe",
      "filter.narva": "Narva",
      "calendar.label": "Weekly training calendar",
      "calendar.hint": "Drag a card by its handle to change the day and time. Tap a card to edit it or an empty time to create a session.",
      "calendar.add": "Create session",
      "calendar.loading": "Preparing the calendar…",
      "timezone": "Times are shown in the Europe/Tallinn time zone.",
      "editor.eyebrow": "PROTECTED CONTROL PANEL",
      "editor.title": "MANAGE THE SCHEDULE",
      "form.title": "Session",
      "form.new": "New session",
      "form.templateNew": "New template",
      "form.templateEdit": "Edit template",
      "form.templateHint": "A template is a saved group without a date or time. Drag it into the calendar to choose time and recurrence. Editing a template does not change sessions already added.",
      "form.duration": "Duration in minutes",
      "form.day": "Primary day",
      "form.recurrence": "Repeat",
      "form.repeatWeekly": "Repeat every week",
      "form.repeatHint": "Select every day on which this session takes place.",
      "form.repeatDays": "Repeat days",
      "form.startsOn": "Start on",
      "form.endsOn": "End on (optional)",
      "form.onceDate": "Session date",
      "form.weekly": "every week",
      "form.once": "one time",
      "day.short.1": "Mon",
      "day.short.2": "Tue",
      "day.short.3": "Wed",
      "day.short.4": "Thu",
      "day.short.5": "Fri",
      "day.short.6": "Sat",
      "day.short.7": "Sun",
      "form.start": "Start",
      "form.end": "End",
      "form.venue": "Gym",
      "form.status": "Status",
      "form.active": "Active",
      "form.cancelled": "Paused",
      "form.preset": "Saved group",
      "form.presetCustom": "Other / manual",
      "form.presetSillamaeChildren": "Sillamäe · ages 6–16",
      "form.presetSillamaeToddlers": "Sillamäe · toddlers under 4",
      "form.presetNarvaChildren": "Narva · ages 5–6 and up",
      "form.languages": "Text in three languages",
      "form.nameLegend": "Title",
      "form.audienceLegend": "Age / group",
      "form.sillamae": "Sillamäe · Kalda 14",
      "form.narva": "Narva · Rakvere 22D",
      "form.titleRu": "Title · RU",
      "form.titleEt": "Title · ET",
      "form.titleEn": "Title · EN",
      "form.audienceRu": "Age / group · RU",
      "form.audienceEt": "Age / group · ET",
      "form.audienceEn": "Age / group · EN",
      "form.placementGroup": "Group",
      "form.save": "Save session",
      "form.placeTemplate": "Add to schedule",
      "form.saveTemplate": "Save template",
      "list.title": "Scheduled sessions",
      "actions.edit": "Edit",
      "actions.delete": "Delete",
      "actions.cancelled": "paused",
      "actions.undo": "Undo",
      "tools.title": "Backup",
      "tools.text": "Export JSON before major changes. Imports are validated before saving.",
      "tools.export": "Export JSON",
      "tools.restore": "Restore backup",
      "tools.reset": "Restore defaults",
      "tools.importLabel": "JSON to import",
      "tools.importPlaceholder": "Paste exported JSON here",
      "tools.importText": "Import text",
      "tools.importFile": "Or choose a JSON file",
      "install.ios": "On iPhone, tap Share and then “Add to Home Screen”.",
      "install.generic": "Open your browser menu and choose “Add to Home screen”.",
      "status.saved": "Session saved.",
      "status.templateSaved": "Template saved.",
      "status.moved": "Session moved.",
      "status.undone": "Move undone.",
      "status.deleted": "Session deleted.",
      "status.templateDeleted": "Template deleted.",
      "status.imported": "Schedule imported.",
      "status.exported": "Export file is ready.",
      "status.reset": "Default schedule restored. The previous version was saved as a backup.",
      "status.restored": "Backup restored.",
      "status.installing": "Opening app installation…",
      "status.update": "An app update will be available after the next launch.",
      "sync.saving": "Saving changes to the shared database…",
      "sync.synced": "Changes are published on every device.",
      "sync.offline": "The shared database is offline. Changes remain on this device and will be sent when the connection returns.",
      "sync.error": "The schedule could not be synced. The local copy is safe.",
      "sync.conflict": "The schedule changed on another device. Choose which version to keep.",
      "sync.retry": "Try again",
      "sync.useCloud": "Load shared",
      "sync.useLocal": "Keep this one",
      "confirm.delete": "Delete this session?",
      "confirm.deleteTemplate": "Delete this template? Sessions already created from it will remain in the calendar.",
      "confirm.reset": "Restore the confirmed default schedule? The current version will be saved as a backup.",
      "confirm.restore": "Replace the current schedule with the latest backup?",
      "error.prefix": "Action failed: ",
      "error.storage": "The browser did not allow the data to be saved. The schedule was not changed. Check free space and privacy settings."
    }
  };

  function text(key) {
    return (COPY[language] && COPY[language][key]) || COPY.ru[key] || key;
  }

  function normaliseLanguage(value) {
    var code = String(value || "").toLowerCase().split(/[-_]/)[0];
    return code === "et" || code === "en" ? code : "ru";
  }

  function languageFromPath() {
    if (/^\/schedule\/et(?:\/|$)/i.test(window.location.pathname)) return "et";
    if (/^\/schedule\/en(?:\/|$)/i.test(window.location.pathname)) return "en";
    return "ru";
  }

  function safeNextPath() {
    var value = window.location.pathname + window.location.search;
    if (value.length > 1200 || !/^\/schedule(?:\/|$)/i.test(value) || /^\/schedule\/login(?:\/|$)/i.test(value) || /[\r\n]/.test(value)) {
      return LANGUAGE_PATHS[language] || LANGUAGE_PATHS.ru;
    }
    return value;
  }

  function loginPath(includeNext) {
    var target = new URL("/schedule/login/", window.location.origin);
    target.searchParams.set("lang", language);
    if (includeNext) target.searchParams.set("next", safeNextPath());
    return target.pathname + target.search;
  }

  function redirectToLogin(includeNext) {
    window.location.replace(loginPath(includeNext));
  }

  function verifyEditorSession() {
    app.setAttribute("data-schedule-auth-state", "checking");
    var controller = typeof window.AbortController === "function" ? new window.AbortController() : null;
    var timeout = controller ? window.setTimeout(function () { controller.abort(); }, 12000) : null;
    return window.fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Accept": "application/json" },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok && response.status !== 401 && response.status !== 403) {
        throw new Error("Session check returned " + response.status);
      }
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (response.status === 401 || response.status === 403 || payload.authenticated !== true) {
          app.setAttribute("data-schedule-auth-state", "unauthorized");
          redirectToLogin(true);
          return new Promise(function () {});
        }
        app.setAttribute("data-schedule-auth-state", "authenticated");
      });
    }).catch(function () {
      app.setAttribute("data-schedule-auth-state", "unavailable");
      showStatus("auth.checkFailed");
      // A temporary outage must not clear or overwrite locally stored schedule work.
    }).then(function (result) {
      if (timeout !== null) window.clearTimeout(timeout);
      return result;
    });
  }

  function logout(button) {
    if (!button || button.disabled) return;
    button.disabled = true;
    showStatus("auth.loggingOut");
    window.fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    }).then(function (response) {
      if (!response.ok && response.status !== 401 && response.status !== 403) {
        throw new Error("Logout returned " + response.status);
      }
      redirectToLogin(false);
    }).catch(function () {
      button.disabled = false;
      showStatus("auth.logoutFailed");
    });
  }

  function customSelectText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function customSelectControllerFor(select) {
    var found = null;
    customSelectControllers.some(function (controller) {
      if (controller.select === select) {
        found = controller;
        return true;
      }
      return false;
    });
    return found;
  }

  function customSelectIcon(pathData, className) {
    var namespace = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(namespace, "svg");
    var path = document.createElementNS(namespace, "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    if (className) svg.setAttribute("class", className);
    path.setAttribute("d", pathData);
    svg.appendChild(path);
    return svg;
  }

  function customSelectOptionSignature(select) {
    return Array.prototype.map.call(select.options, function (option) {
      return [option.value, customSelectText(option.textContent), option.disabled ? "1" : "0"].join("\u0001");
    }).join("\u0002");
  }

  function rebuildCustomSelectOptions(controller) {
    var select = controller.select;
    var listbox = controller.listbox;
    listbox.replaceChildren();
    Array.prototype.forEach.call(select.options, function (nativeOption, index) {
      var option = document.createElement("button");
      option.type = "button";
      option.className = "schedule-select__option";
      option.id = controller.listbox.id + "-option-" + index;
      option.setAttribute("role", "option");
      option.setAttribute("tabindex", "-1");
      option.setAttribute("data-schedule-select-option", "");
      option.setAttribute("data-value", nativeOption.value);
      option.setAttribute("aria-selected", nativeOption.selected ? "true" : "false");
      if (nativeOption.disabled) {
        option.disabled = true;
        option.setAttribute("aria-disabled", "true");
      }

      var mark = document.createElement("span");
      mark.className = "schedule-select__option-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.appendChild(customSelectIcon("m5 12 4 4L19 6", "schedule-select__check-icon"));
      var optionLabel = document.createElement("span");
      optionLabel.className = "schedule-select__option-label";
      optionLabel.textContent = customSelectText(nativeOption.textContent);
      option.appendChild(mark);
      option.appendChild(optionLabel);
      listbox.appendChild(option);
    });
    controller.activeOption = null;
    controller.optionSignature = customSelectOptionSignature(select);
  }

  function syncCustomSelect(controller, forceRebuild) {
    if (!controller || !controller.select || !controller.select.isConnected) return;
    var signature = customSelectOptionSignature(controller.select);
    if (forceRebuild || signature !== controller.optionSignature) rebuildCustomSelectOptions(controller);

    var selectedIndex = controller.select.selectedIndex;
    var selectedOption = selectedIndex >= 0 ? controller.select.options[selectedIndex] : null;
    controller.value.textContent = selectedOption ? customSelectText(selectedOption.textContent) : "";
    controller.trigger.disabled = Boolean(controller.select.disabled);
    controller.trigger.setAttribute("aria-disabled", String(Boolean(controller.select.disabled)));
    if (!controller.select.validity || controller.select.validity.valid) {
      controller.wrapper.removeAttribute("data-schedule-select-invalid");
    }
    Array.prototype.forEach.call(controller.listbox.querySelectorAll("[data-schedule-select-option]"), function (option, index) {
      var isSelected = index === selectedIndex;
      option.setAttribute("aria-selected", isSelected ? "true" : "false");
      option.classList.toggle("schedule-select__option--selected", isSelected);
    });
    if (controller.wrapper.hasAttribute("data-schedule-select-open")) {
      focusCustomSelectOption(controller, "selected");
    }
  }

  function finishCustomSelectClose(controller) {
    if (!controller) return;
    window.clearTimeout(controller.closeTimer);
    controller.closeTimer = 0;
    controller.wrapper.removeAttribute("data-schedule-select-closing");
    controller.listbox.hidden = true;
    controller.wrapper.removeAttribute("data-schedule-select-placement");
    controller.listbox.style.removeProperty("--schedule-select-placement-max-height");
  }

  function closeCustomSelect(controller, restoreFocus, immediate) {
    if (!controller) return;
    var wasOpen = controller.wrapper.hasAttribute("data-schedule-select-open");
    if (openCustomSelectController === controller) openCustomSelectController = null;
    window.clearTimeout(controller.closeTimer);
    controller.closeTimer = 0;
    if (restoreFocus) focusWithoutScroll(controller.trigger);
    controller.trigger.setAttribute("aria-expanded", "false");
    controller.trigger.removeAttribute("aria-activedescendant");
    Array.prototype.forEach.call(controller.listbox.querySelectorAll("[data-schedule-select-option]"), function (option) {
      option.removeAttribute("data-active");
      option.removeAttribute("data-schedule-select-active");
    });
    controller.activeOption = null;
    controller.wrapper.removeAttribute("data-schedule-select-open");
    controller.listbox.setAttribute("aria-hidden", "true");
    if (immediate || !wasOpen) {
      finishCustomSelectClose(controller);
      return;
    }
    controller.wrapper.setAttribute("data-schedule-select-closing", "true");
    controller.closeTimer = window.setTimeout(function () {
      finishCustomSelectClose(controller);
    }, CUSTOM_SELECT_CLOSE_DURATION);
  }

  function closeAllCustomSelects(immediate) {
    customSelectControllers.forEach(function (controller) {
      closeCustomSelect(controller, false, immediate !== false);
    });
  }

  function customSelectFocusableOptions(controller) {
    return Array.prototype.filter.call(controller.listbox.querySelectorAll("[data-schedule-select-option]"), function (option) {
      return !option.disabled;
    });
  }

  function focusCustomSelectOption(controller, target) {
    var options = customSelectFocusableOptions(controller);
    if (!options.length) return;
    var option = target;
    if (target === "first") option = options[0];
    else if (target === "last") option = options[options.length - 1];
    else if (target === "selected") {
      option = controller.listbox.querySelector('[data-schedule-select-option][aria-selected="true"]');
      if (!option || option.disabled) option = options[0];
    }
    if (!option || options.indexOf(option) === -1) return;
    controller.activeOption = option;
    Array.prototype.forEach.call(controller.listbox.querySelectorAll("[data-schedule-select-option]"), function (candidate) {
      var isActive = candidate === option;
      if (isActive) {
        candidate.setAttribute("data-active", "true");
        candidate.setAttribute("data-schedule-select-active", "true");
      } else {
        candidate.removeAttribute("data-active");
        candidate.removeAttribute("data-schedule-select-active");
      }
    });
    controller.trigger.setAttribute("aria-activedescendant", option.id);
    if (typeof option.scrollIntoView === "function") {
      try {
        option.scrollIntoView({ block: "nearest" });
      } catch (_error) {
        option.scrollIntoView(false);
      }
    }
  }

  function positionCustomSelect(controller) {
    var wrapper = controller.wrapper;
    var listbox = controller.listbox;
    var dialog = wrapper.closest("dialog[open]");
    var scrollViewport = wrapper.closest(".schedule-editor-dialog__content");
    var viewport = window.visualViewport;
    var viewportTop = viewport ? viewport.offsetTop : 0;
    var viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    var boundaryTop = viewportTop + 8;
    var boundaryBottom = viewportBottom - 8;

    if (dialog) {
      var dialogRect = dialog.getBoundingClientRect();
      boundaryTop = Math.max(boundaryTop, dialogRect.top + 8);
      boundaryBottom = Math.min(boundaryBottom, dialogRect.bottom - 8);
    }
    if (scrollViewport) {
      var scrollViewportRect = scrollViewport.getBoundingClientRect();
      boundaryTop = Math.max(boundaryTop, scrollViewportRect.top + 8);
      boundaryBottom = Math.min(boundaryBottom, scrollViewportRect.bottom - 8);
    }

    // Always measure from the default downward position. A previous opening
    // may have used the opposite side before the popup was hidden.
    wrapper.setAttribute("data-schedule-select-placement", "bottom");
    listbox.style.removeProperty("--schedule-select-placement-max-height");
    var triggerRect = controller.trigger.getBoundingClientRect();
    var listboxHeight = listbox.getBoundingClientRect().height;
    var popupGap = 7;
    var spaceBelow = Math.max(0, boundaryBottom - triggerRect.bottom - popupGap);
    var spaceAbove = Math.max(0, triggerRect.top - boundaryTop - popupGap);
    var viewportWidth = viewport ? viewport.width : window.innerWidth;
    var longMobilePopup = viewportWidth <= 480
      && controller.listbox.querySelectorAll("[data-schedule-select-option]").length >= 4
      && spaceAbove >= listboxHeight;
    var placement = longMobilePopup || (spaceBelow < listboxHeight && spaceAbove > spaceBelow) ? "top" : "bottom";
    var availableHeight = placement === "top" ? spaceAbove : spaceBelow;

    wrapper.setAttribute("data-schedule-select-placement", placement);
    listbox.style.setProperty(
      "--schedule-select-placement-max-height",
      Math.max(0, Math.floor(availableHeight)) + "px"
    );
  }

  function openCustomSelect(controller, focusTarget) {
    if (!controller || controller.select.disabled) return;
    if (openCustomSelectController && openCustomSelectController !== controller) {
      closeCustomSelect(openCustomSelectController, false, true);
    }
    syncCustomSelect(controller, false);
    window.clearTimeout(controller.closeTimer);
    controller.closeTimer = 0;
    controller.wrapper.removeAttribute("data-schedule-select-closing");
    controller.listbox.hidden = false;
    controller.listbox.removeAttribute("aria-hidden");
    positionCustomSelect(controller);
    // Commit the closed geometry before adding the state attribute so CSS can
    // animate both opacity and vertical movement instead of flashing open.
    controller.listbox.getBoundingClientRect();
    controller.wrapper.setAttribute("data-schedule-select-open", "true");
    controller.trigger.setAttribute("aria-expanded", "true");
    openCustomSelectController = controller;
    if (focusTarget) focusCustomSelectOption(controller, focusTarget);
    focusWithoutScroll(controller.trigger);
  }

  function dispatchCustomSelectEvent(select, type) {
    var event;
    try {
      event = new Event(type, { bubbles: true });
    } catch (_error) {
      event = document.createEvent("Event");
      event.initEvent(type, true, false);
    }
    select.dispatchEvent(event);
  }

  function chooseCustomSelectOption(controller, option) {
    if (!controller || !option || option.disabled) return;
    var previousValue = controller.select.value;
    controller.select.value = option.getAttribute("data-value");
    syncCustomSelect(controller, false);
    if (controller.select.value !== previousValue) {
      dispatchCustomSelectEvent(controller.select, "input");
      dispatchCustomSelectEvent(controller.select, "change");
    }
    closeCustomSelect(controller, true, false);
  }

  function moveCustomSelectFocus(controller, current, delta) {
    var options = customSelectFocusableOptions(controller);
    if (!options.length) return;
    var index = options.indexOf(current || controller.activeOption);
    if (index < 0) index = 0;
    else index = (index + delta + options.length) % options.length;
    focusCustomSelectOption(controller, options[index]);
  }

  function handleCustomSelectKeydown(controller, event) {
    var trigger = event.target.closest && event.target.closest("[data-schedule-select-trigger]");
    var option = event.target.closest && event.target.closest("[data-schedule-select-option]");
    var key = event.key;
    if (trigger) {
      var isOpen = controller.wrapper.hasAttribute("data-schedule-select-open");
      if (!isOpen && (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp")) {
        event.preventDefault();
        openCustomSelect(controller, key === "ArrowUp" ? "last" : "selected");
      } else if (isOpen && (key === "ArrowDown" || key === "ArrowUp")) {
        event.preventDefault();
        moveCustomSelectFocus(controller, controller.activeOption, key === "ArrowDown" ? 1 : -1);
      } else if (isOpen && (key === "Home" || key === "End")) {
        event.preventDefault();
        focusCustomSelectOption(controller, key === "Home" ? "first" : "last");
      } else if (isOpen && (key === "Enter" || key === " ")) {
        event.preventDefault();
        chooseCustomSelectOption(controller, controller.activeOption);
      } else if (key === "Escape" && isOpen) {
        event.preventDefault();
        closeCustomSelect(controller, true, false);
      } else if (key === "Tab" && isOpen) {
        closeCustomSelect(controller, false, true);
      }
      return;
    }
    if (!option) return;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      moveCustomSelectFocus(controller, option, key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (key === "Home" || key === "End") {
      event.preventDefault();
      focusCustomSelectOption(controller, key === "Home" ? "first" : "last");
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      chooseCustomSelectOption(controller, option);
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      closeCustomSelect(controller, true, false);
      return;
    }
    if (key === "Tab") closeCustomSelect(controller, false, true);
  }

  function enhanceCustomSelect(select) {
    if (!select || customSelectControllerFor(select)) return;
    if (select.closest("[data-schedule-legacy-weekday]") || select.closest("[hidden]")) return;

    customSelectCounter += 1;
    var name = String(select.name || "field").replace(/[^a-zA-Z0-9_-]/g, "-");
    var baseId = "schedule-select-" + name + "-" + customSelectCounter;
    var wrapper = document.createElement("span");
    wrapper.className = "schedule-select schedule-select--" + name;
    wrapper.setAttribute("data-schedule-select", "");
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = baseId + "-trigger";
    trigger.className = "schedule-select__trigger";
    trigger.setAttribute("data-schedule-select-trigger", "");
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", baseId + "-listbox");

    var value = document.createElement("span");
    value.id = baseId + "-value";
    value.className = "schedule-select__value";
    value.setAttribute("data-schedule-select-value", "");
    var chevron = document.createElement("span");
    chevron.className = "schedule-select__chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.appendChild(customSelectIcon("m7 9 5 5 5-5", "schedule-select__chevron-icon"));
    trigger.appendChild(value);
    trigger.appendChild(chevron);

    var listbox = document.createElement("span");
    listbox.id = baseId + "-listbox";
    listbox.className = "schedule-select__listbox";
    listbox.setAttribute("data-schedule-select-listbox", "");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("aria-labelledby", trigger.id);
    listbox.setAttribute("aria-hidden", "true");
    listbox.hidden = true;

    var label = select.closest("label");
    var caption = label ? label.querySelector("[data-schedule-i18n]") : null;
    if (caption) {
      if (!caption.id) caption.id = baseId + "-label";
      trigger.setAttribute("aria-labelledby", caption.id + " " + value.id);
    } else {
      trigger.setAttribute("aria-labelledby", value.id);
    }

    wrapper.appendChild(trigger);
    wrapper.appendChild(listbox);
    var controller = {
      select: select,
      wrapper: wrapper,
      trigger: trigger,
      value: value,
      listbox: listbox,
      label: label,
      optionSignature: "",
      activeOption: null,
      originalTabindex: select.getAttribute("tabindex"),
      originalAriaHidden: select.getAttribute("aria-hidden"),
      closeTimer: 0
    };
    customSelectControllers.push(controller);
    rebuildCustomSelectOptions(controller);
    syncCustomSelect(controller, false);

    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (wrapper.hasAttribute("data-schedule-select-open")) closeCustomSelect(controller, true, false);
      else openCustomSelect(controller, "selected");
    });
    wrapper.addEventListener("click", function (event) {
      var option = event.target.closest && event.target.closest("[data-schedule-select-option]");
      if (option) {
        event.preventDefault();
        event.stopPropagation();
        chooseCustomSelectOption(controller, option);
      }
    });
    wrapper.addEventListener("keydown", function (event) {
      handleCustomSelectKeydown(controller, event);
    });
    select.addEventListener("change", function () {
      syncCustomSelect(controller, false);
    });
    select.addEventListener("input", function () {
      syncCustomSelect(controller, false);
    });
    select.addEventListener("invalid", function (event) {
      event.preventDefault();
      wrapper.setAttribute("data-schedule-select-invalid", "true");
      focusWithoutScroll(trigger);
    });
    trigger.addEventListener("focus", function () {
      if (select.validity && select.validity.valid) wrapper.removeAttribute("data-schedule-select-invalid");
    });
    if (label && caption) {
      caption.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openCustomSelect(controller, "selected");
      });
    }

    // CSS hides the native control only after this final flag is present, so a
    // partially executed enhancement always falls back to the browser select.
    select.classList.add("schedule-select__native");
    select.setAttribute("data-schedule-select-native", "");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");
    wrapper.setAttribute("data-schedule-select-enhanced", "true");
  }

  function pruneCustomSelectControllers() {
    customSelectControllers = customSelectControllers.filter(function (controller) {
      var connected = controller.select.isConnected && controller.wrapper.isConnected;
      if (!connected) {
        window.clearTimeout(controller.closeTimer);
        if (openCustomSelectController === controller) openCustomSelectController = null;
        controller.select.classList.remove("schedule-select__native");
        controller.select.removeAttribute("data-schedule-select-native");
        if (controller.originalTabindex === null) controller.select.removeAttribute("tabindex");
        else controller.select.setAttribute("tabindex", controller.originalTabindex);
        if (controller.originalAriaHidden === null) controller.select.removeAttribute("aria-hidden");
        else controller.select.setAttribute("aria-hidden", controller.originalAriaHidden);
      }
      return connected;
    });
  }

  function refreshCustomSelects(forceRebuild) {
    pruneCustomSelectControllers();
    Array.prototype.forEach.call(app.querySelectorAll("[data-schedule-form] select"), enhanceCustomSelect);
    customSelectControllers.forEach(function (controller) {
      syncCustomSelect(controller, Boolean(forceRebuild));
    });
  }

  function focusCustomSelect(select) {
    var controller = customSelectControllerFor(select);
    focusWithoutScroll(controller ? controller.trigger : select);
  }

  function applyLanguage(nextLanguage) {
    closeAllCustomSelects(true);
    language = normaliseLanguage(nextLanguage);
    document.documentElement.lang = language;
    document.documentElement.setAttribute("data-schedule-language", language);
    Array.prototype.forEach.call(document.querySelectorAll("[data-schedule-i18n]"), function (node) {
      node.textContent = text(node.getAttribute("data-schedule-i18n"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-schedule-i18n-placeholder]"), function (node) {
      node.setAttribute("placeholder", text(node.getAttribute("data-schedule-i18n-placeholder")));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-schedule-i18n-aria-label]"), function (node) {
      node.setAttribute("aria-label", text(node.getAttribute("data-schedule-i18n-aria-label")));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-schedule-home-link]"), function (link) {
      link.setAttribute("href", HOME_PATHS[language]);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-schedule-language-switch]"), function (link) {
      var isCurrent = normaliseLanguage(link.getAttribute("data-language")) === language;
      if (isCurrent) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    var switcher = document.querySelector(".schedule-language-switcher");
    if (switcher) switcher.setAttribute("data-active-language", language);
    updateFormModeCopy();
    refreshCustomSelects(true);
    store.setUi({ language: language });
    renderEditorList();
    refreshInstallUi();
    if (window.DzhikaevaScheduleWidget) window.DzhikaevaScheduleWidget.setLanguage(language);
    if (window.DzhikaevaScheduleCalendar) window.DzhikaevaScheduleCalendar.renderAll();
  }

  function getSessionDialog() {
    return app.querySelector("[data-schedule-session-dialog]");
  }

  function getManageDialog() {
    return app.querySelector("[data-schedule-manage-dialog]");
  }

  function dialogIsOpen(dialog) {
    return Boolean(dialog && (dialog.open || dialog.hasAttribute("data-schedule-fallback-open")));
  }

  function anyDialogIsOpen() {
    return dialogIsOpen(getSessionDialog()) || dialogIsOpen(getManageDialog());
  }

  function captureFocusTarget(node) {
    var target = node && node.nodeType === 1 ? node : document.activeElement;
    if (!target || target === document.body || target === document.documentElement) return null;
    var sessionCard = target.closest && target.closest("[data-session-id]");
    var templateCard = target.closest && target.closest("[data-template-id]");
    var templateCreate = target.closest && target.closest("[data-schedule-palette-create]");
    var manageEdit = target.closest && target.closest("[data-schedule-edit]");
    var manageDelete = target.closest && target.closest("[data-schedule-delete]");
    return {
      element: target,
      sessionId: sessionCard ? sessionCard.getAttribute("data-session-id") : "",
      occurrenceDate: sessionCard ? sessionCard.getAttribute("data-occurrence-date") : "",
      templateId: templateCard ? templateCard.getAttribute("data-template-id") : "",
      templateCreate: Boolean(templateCreate),
      manageSessionId: manageEdit
        ? manageEdit.getAttribute("data-schedule-edit")
        : manageDelete
          ? manageDelete.getAttribute("data-schedule-delete")
          : "",
      manageAction: manageDelete ? "delete" : manageEdit ? "edit" : ""
    };
  }

  function safeAttributeValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function resolveFocusTarget(snapshot) {
    if (!snapshot) return null;
    if (snapshot.element && snapshot.element.isConnected && !snapshot.element.closest("[hidden]")) {
      return snapshot.element;
    }
    if (snapshot.sessionId) {
      var sessionSelector = '[data-session-id="' + safeAttributeValue(snapshot.sessionId) + '"]';
      if (snapshot.occurrenceDate) {
        sessionSelector += '[data-occurrence-date="' + safeAttributeValue(snapshot.occurrenceDate) + '"]';
      }
      var sessionTarget = app.querySelector(sessionSelector);
      if (sessionTarget) return sessionTarget;
    }
    if (snapshot.templateId) {
      var templateSelector = '[data-template-id="' + safeAttributeValue(snapshot.templateId) + '"]';
      var templateTarget = app.querySelector('[data-schedule-palette-select]' + templateSelector)
        || app.querySelector('[data-schedule-palette-edit]' + templateSelector)
        || app.querySelector(templateSelector + '[tabindex="0"]');
      if (templateTarget) return templateTarget;
    }
    if (snapshot.templateCreate) {
      var templateCreateTarget = app.querySelector("[data-schedule-palette-create]");
      if (templateCreateTarget) return templateCreateTarget;
    }
    if (snapshot.manageSessionId) {
      var manageAttribute = snapshot.manageAction === "delete" ? "data-schedule-delete" : "data-schedule-edit";
      var manageTarget = app.querySelector("[" + manageAttribute + '=\"' + safeAttributeValue(snapshot.manageSessionId) + '\"]');
      if (manageTarget) return manageTarget;
    }
    return null;
  }

  function focusWithoutScroll(node) {
    if (!node || typeof node.focus !== "function") return;
    try {
      node.focus({ preventScroll: true });
    } catch (_error) {
      node.focus();
    }
  }

  function setPageScrollLocked(locked) {
    var html = document.documentElement;
    var body = document.body;
    if (locked) {
      if (scrollLockState) return;
      scrollLockState = {
        htmlOverflow: html.style.overflow,
        bodyOverflow: body.style.overflow,
        htmlAttribute: html.getAttribute("data-schedule-modal-open"),
        bodyAttribute: body.getAttribute("data-schedule-modal-open"),
        bodyHadModalClass: body.classList.contains("schedule-modal-open")
      };
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      html.setAttribute("data-schedule-modal-open", "true");
      body.setAttribute("data-schedule-modal-open", "true");
      body.classList.add("schedule-modal-open");
      return;
    }
    if (!scrollLockState) return;
    html.style.overflow = scrollLockState.htmlOverflow;
    body.style.overflow = scrollLockState.bodyOverflow;
    if (scrollLockState.htmlAttribute === null) html.removeAttribute("data-schedule-modal-open");
    else html.setAttribute("data-schedule-modal-open", scrollLockState.htmlAttribute);
    if (scrollLockState.bodyAttribute === null) body.removeAttribute("data-schedule-modal-open");
    else body.setAttribute("data-schedule-modal-open", scrollLockState.bodyAttribute);
    if (!scrollLockState.bodyHadModalClass) body.classList.remove("schedule-modal-open");
    scrollLockState = null;
  }

  function syncDialogState() {
    var open = anyDialogIsOpen();
    setPageScrollLocked(open);
    app.setAttribute("data-schedule-mode", open ? "editor" : "schedule");
    Array.prototype.forEach.call(app.querySelectorAll('[data-schedule-panel="schedule"]'), function (panel) {
      panel.hidden = false;
    });
  }

  function restoreDialogFocus(dialog) {
    var snapshot = dialog === getSessionDialog() ? sessionDialogOpener : manageDialogOpener;
    if (dialog === getSessionDialog()) sessionDialogOpener = null;
    else manageDialogOpener = null;
    var target = resolveFocusTarget(snapshot);
    if (!target && dialog === getSessionDialog()) {
      target = app.querySelector("[data-calendar-create]") || app.querySelector("[data-schedule-calendar]");
    }
    if (!target) target = app.querySelector("[data-schedule-open-manage]") || app.querySelector("[data-schedule-calendar]");
    focusWithoutScroll(target);
  }

  function suppressDialogRestore(dialog) {
    if (dialog && suppressedDialogRestores.indexOf(dialog) === -1) suppressedDialogRestores.push(dialog);
  }

  function consumeSuppressedDialogRestore(dialog) {
    var index = suppressedDialogRestores.indexOf(dialog);
    if (index === -1) return false;
    suppressedDialogRestores.splice(index, 1);
    return true;
  }

  function showDialog(dialog, opener, moveFocus) {
    if (!dialog) return false;
    refreshCustomSelects(false);
    if (dialogIsOpen(dialog)) {
      if (moveFocus) focusWithoutScroll(dialog);
      return true;
    }
    var snapshot = opener && opener.element ? opener : captureFocusTarget(opener);
    if (dialog === getSessionDialog()) sessionDialogOpener = snapshot;
    else manageDialogOpener = snapshot;
    dialog.hidden = false;
    if (typeof dialog.showModal === "function") {
      try {
        dialog.showModal();
      } catch (_error) {
        dialog.setAttribute("open", "");
        dialog.setAttribute("data-schedule-fallback-open", "true");
      }
    } else {
      dialog.setAttribute("open", "");
      dialog.setAttribute("data-schedule-fallback-open", "true");
    }
    syncDialogState();
    if (moveFocus) {
      if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
      focusWithoutScroll(dialog);
    }
    return true;
  }

  function closeDialog(dialog, restoreFocus) {
    if (!dialog || !dialogIsOpen(dialog)) return;
    closeAllCustomSelects(true);
    if (!restoreFocus) suppressDialogRestore(dialog);
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
      syncDialogState();
      return;
    } else {
      dialog.removeAttribute("open");
      dialog.removeAttribute("data-schedule-fallback-open");
      dialog.hidden = true;
    }
    syncDialogState();
    if (restoreFocus && !anyDialogIsOpen()) restoreDialogFocus(dialog);
  }

  function updateSessionCloseLabel() {
    var close = getSessionDialog() && getSessionDialog().querySelector("[data-schedule-close-session]");
    if (!close) return;
    var key = sessionReturnToManage ? "modal.back" : "modal.close";
    close.setAttribute("data-schedule-i18n-aria-label", key);
    close.setAttribute("aria-label", text(key));
  }

  function closeSessionDialog(restoreFocus, allowManageReturn) {
    var shouldReturnToManage = sessionReturnToManage && allowManageReturn !== false;
    var focusTarget = sessionManageFocusTarget;
    sessionReturnToManage = false;
    sessionManageFocusTarget = null;
    updateSessionCloseLabel();

    if (!shouldReturnToManage) {
      closeDialog(getSessionDialog(), restoreFocus !== false);
      return;
    }

    closeDialog(getSessionDialog(), false);
    showDialog(getManageDialog(), manageDialogOpener, false);
    window.requestAnimationFrame(function () {
      var target = resolveFocusTarget(focusTarget)
        || getManageDialog().querySelector("[data-schedule-edit]")
        || getManageDialog().querySelector("[tabindex=\"-1\"]");
      focusWithoutScroll(target || getManageDialog());
    });
  }

  function closeManageDialog(restoreFocus) {
    closeDialog(getManageDialog(), restoreFocus !== false);
  }

  function openManageDialog(moveFocus) {
    var sessionDialog = getSessionDialog();
    if (dialogIsOpen(sessionDialog)) closeSessionDialog(false, false);
    showDialog(getManageDialog(), null, moveFocus !== false);
  }

  function openSessionDialog(moveFocus) {
    var manageDialog = getManageDialog();
    var opener = null;
    if (dialogIsOpen(manageDialog)) {
      sessionReturnToManage = true;
      sessionManageFocusTarget = captureFocusTarget(document.activeElement);
      opener = sessionManageFocusTarget || manageDialogOpener;
      closeManageDialog(false);
    } else {
      sessionReturnToManage = false;
      sessionManageFocusTarget = null;
    }
    updateSessionCloseLabel();
    var dialog = getSessionDialog();
    showDialog(dialog, opener, moveFocus !== false);
    if (!dialog) return;
    var content = dialog.querySelector(".schedule-editor-dialog__content");
    dialog.scrollTop = 0;
    if (content) content.scrollTop = 0;
  }

  function setMode(mode, moveFocus) {
    if (mode === "editor") {
      openManageDialog(moveFocus);
      return;
    }
    var sessionDialog = getSessionDialog();
    var manageDialog = getManageDialog();
    if (dialogIsOpen(sessionDialog)) closeSessionDialog(moveFocus !== false, false);
    if (dialogIsOpen(manageDialog)) closeManageDialog(moveFocus !== false);
    syncDialogState();
  }

  function formElement(name) {
    return app.querySelector("[data-schedule-form]").elements.namedItem(name);
  }

  function setTranslatedNode(node, key) {
    if (!node) return;
    node.setAttribute("data-schedule-i18n", key);
    node.textContent = text(key);
  }

  function updateFormModeCopy() {
    var heading = app.querySelector("[data-schedule-form-heading]");
    var subtitle = app.querySelector("[data-schedule-form-subtitle]");
    var dialog = getSessionDialog();
    var saveLabel = app.querySelector("[data-schedule-save] [data-schedule-i18n]") || app.querySelector("[data-schedule-save] span");
    var deleteCurrent = app.querySelector("[data-schedule-delete-current]");
    if (heading) {
      heading.classList.toggle("schedule-form__placement-heading", formMode === "template-placement");
      if (formMode !== "template-placement") heading.removeAttribute("aria-label");
    }
    if (subtitle) {
      subtitle.hidden = formMode !== "template-placement";
      if (subtitle.hidden) subtitle.textContent = "";
      if (subtitle.hidden && dialog && dialog.getAttribute("aria-describedby") === subtitle.id) {
        dialog.removeAttribute("aria-describedby");
      }
    }
    if (formMode === "template") {
      setTranslatedNode(heading, editingTemplateId ? "form.templateEdit" : "form.templateNew");
      setTranslatedNode(saveLabel, "form.saveTemplate");
      setTranslatedNode(deleteCurrent, "modal.deleteTemplate");
    } else if (formMode === "template-placement") {
      var sourceTemplate = templateById(placementTemplateId);
      var localizedTitle = formElement("title-" + language);
      var templateTitle = localizedTitle && localizedTitle.value
        ? localizedTitle.value
        : sourceTemplate && sourceTemplate.title
          ? sourceTemplate.title[language] || sourceTemplate.title.ru || sourceTemplate.title.et || sourceTemplate.title.en
          : "";
      heading.removeAttribute("data-schedule-i18n");
      heading.textContent = templateTitle;
      heading.setAttribute("aria-label", text("form.placeTemplate") + ": " + templateTitle);
      var localizedAudience = formElement("audience-" + language);
      var templateAudience = localizedAudience && localizedAudience.value
        ? localizedAudience.value
        : sourceTemplate && sourceTemplate.audience
          ? sourceTemplate.audience[language] || sourceTemplate.audience.ru || sourceTemplate.audience.et || sourceTemplate.audience.en
          : "";
      if (subtitle) {
        subtitle.textContent = text("form.placementGroup") + " · " + templateAudience;
        subtitle.hidden = !templateAudience;
        if (dialog) {
          if (templateAudience) dialog.setAttribute("aria-describedby", subtitle.id);
          else if (dialog.getAttribute("aria-describedby") === subtitle.id) dialog.removeAttribute("aria-describedby");
        }
      }
      setTranslatedNode(saveLabel, "form.placeTemplate");
      setTranslatedNode(deleteCurrent, "modal.delete");
    } else {
      var item = editingId && store.getSessions().find(function (candidate) { return candidate.id === editingId; });
      if (item) {
        heading.removeAttribute("data-schedule-i18n");
        heading.textContent = text("form.title") + " · " + item.start;
      } else {
        setTranslatedNode(heading, "form.new");
      }
      setTranslatedNode(saveLabel, "form.save");
      setTranslatedNode(deleteCurrent, "modal.delete");
    }
    if (deleteCurrent) deleteCurrent.hidden = !(editingId || editingTemplateId);
  }

  function setFormMode(nextMode) {
    var templateMode = nextMode === "template";
    var placementMode = nextMode === "template-placement";
    var form = app.querySelector("[data-schedule-form]");
    var dialog = getSessionDialog();
    formMode = templateMode ? "template" : placementMode ? "template-placement" : "session";
    [form, dialog].forEach(function (node) {
      if (node) node.setAttribute("data-schedule-form-mode", formMode);
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-schedule-session-only]"), function (node) {
      node.hidden = templateMode;
      Array.prototype.forEach.call(node.querySelectorAll("input, select, textarea, button"), function (control) {
        control.disabled = templateMode;
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-schedule-template-only]"), function (node) {
      node.hidden = !templateMode;
      Array.prototype.forEach.call(node.querySelectorAll("input, select, textarea, button"), function (control) {
        control.disabled = !templateMode;
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll("[data-schedule-placement-hidden]"), function (node) {
      var hidden = placementMode || (templateMode && node.hasAttribute("data-schedule-session-only"));
      node.hidden = hidden;
      Array.prototype.forEach.call(node.querySelectorAll("input, select, textarea, button"), function (control) {
        control.disabled = hidden;
      });
    });
    formElement("weekday").disabled = templateMode;
    if (!templateMode) {
      formElement("start").disabled = false;
      formElement("end").disabled = false;
      formElement("status").disabled = placementMode;
      syncRecurrenceUi();
    }
    if (placementMode) app.querySelector("[data-schedule-language-details]").open = false;
    updateFormModeCopy();
    refreshCustomSelects(false);
  }

  function weekdayInputs() {
    return Array.prototype.slice.call(app.querySelectorAll('[data-schedule-form] input[name="weekdays"]'));
  }

  function selectedWeekdays() {
    return weekdayInputs().filter(function (input) { return input.checked; }).map(function (input) {
      return Number(input.value);
    }).sort(function (left, right) { return left - right; });
  }

  function setWeekdays(values) {
    var selected = Array.isArray(values) ? values.map(Number) : [];
    weekdayInputs().forEach(function (input) {
      input.checked = selected.indexOf(Number(input.value)) !== -1;
    });
  }

  function syncRecurrenceUi() {
    var weekly = Boolean(formElement("repeat-weekly").checked);
    var weekdays = app.querySelector("[data-schedule-weekdays]");
    var weeklyRange = app.querySelector("[data-schedule-weekly-range]");
    var onceDate = app.querySelector("[data-schedule-once-date]");
    weekdays.hidden = !weekly;
    weeklyRange.hidden = !weekly;
    onceDate.hidden = weekly;
    weekdayInputs().forEach(function (input) { input.disabled = !weekly; });
    [formElement("starts-on"), formElement("ends-on")].forEach(function (input) { input.disabled = !weekly; });
    formElement("date").disabled = weekly;
    formElement("date").required = !weekly;
    if (weekly && !selectedWeekdays().length) {
      setWeekdays([Number(formElement("weekday").value) || 1]);
    }
  }

  function setPrimaryWeekday(value) {
    var weekday = Number(value);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) weekday = 1;
    formElement("weekday").value = String(weekday);
    if (formElement("repeat-weekly").checked && selectedWeekdays().indexOf(weekday) === -1) {
      var next = selectedWeekdays();
      next.push(weekday);
      setWeekdays(next);
    }
  }

  function makeId() {
    var random = "";
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      var values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      random = values[0].toString(36);
    } else {
      random = Math.floor(Math.random() * 1000000).toString(36);
    }
    return "session-" + Date.now().toString(36) + "-" + random;
  }

  function timeToMinutes(value) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""))) return -1;
    var parts = String(value).split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function minutesToTime(value) {
    if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) return "";
    var hours = String(Math.floor(value / 60)).padStart(2, "0");
    var minutes = String(value % 60).padStart(2, "0");
    return hours + ":" + minutes;
  }

  function endTimeForTemplate(template, start, fallbackEnd) {
    var targetStart = timeToMinutes(start);
    var duration = Number(template && template.durationMinutes);
    var computed = minutesToTime(targetStart + duration);
    if (Number.isInteger(duration) && duration > 0 && computed) return computed;
    return timeToMinutes(fallbackEnd) > targetStart ? fallbackEnd : start;
  }

  function applyTemplateToForm(template) {
    var preset = detectPreset(template);
    formElement("group-preset").value = preset;
    app.querySelector("[data-schedule-language-details]").open = preset === "custom";
    formElement("venue").value = template.venue;
    formElement("status").value = "active";
    editingTemplateDuration = Number.isInteger(template.durationMinutes) && template.durationMinutes > 0
      ? template.durationMinutes
      : 60;
    formElement("template-duration").value = String(editingTemplateDuration);
    ["ru", "et", "en"].forEach(function (code) {
      formElement("title-" + code).value = template.title[code];
      formElement("audience-" + code).value = template.audience[code];
    });
    refreshCustomSelects(false);
  }

  function readForm() {
    var weekly = Boolean(formElement("repeat-weekly").checked);
    var weekdays = weekly ? selectedWeekdays() : [];
    if (weekly && !weekdays.length) weekdays = [Number(formElement("weekday").value) || 1];
    var onceDate = weekly ? "" : formElement("date").value;
    return {
      id: editingId || makeId(),
      weekday: weekly ? weekdays[0] : dates.dateToWeekday(onceDate),
      recurrence: weekly ? "weekly" : "once",
      weekdays: weekdays,
      date: onceDate,
      startsOn: weekly ? formElement("starts-on").value : "",
      endsOn: weekly ? formElement("ends-on").value : "",
      start: formElement("start").value,
      end: formElement("end").value,
      venue: formElement("venue").value,
      status: formElement("status").value,
      title: {
        ru: formElement("title-ru").value,
        et: formElement("title-et").value,
        en: formElement("title-en").value
      },
      audience: {
        ru: formElement("audience-ru").value,
        et: formElement("audience-et").value,
        en: formElement("audience-en").value
      }
    };
  }

  function makeTemplateId() {
    return makeId().replace(/^session-/, "template-custom-");
  }

  function readTemplateForm() {
    editingTemplateDuration = Number(formElement("template-duration").value);
    return {
      id: editingTemplateId || makeTemplateId(),
      venue: formElement("venue").value,
      title: {
        ru: formElement("title-ru").value,
        et: formElement("title-et").value,
        en: formElement("title-en").value
      },
      audience: {
        ru: formElement("audience-ru").value,
        et: formElement("audience-et").value,
        en: formElement("audience-en").value
      },
      durationMinutes: editingTemplateDuration
    };
  }

  function resetForm(shouldFocus) {
    var form = app.querySelector("[data-schedule-form]");
    editingId = "";
    editingTemplateId = "";
    placementTemplateId = "";
    editingTemplateDuration = 60;
    form.reset();
    formElement("template-duration").value = "60";
    formElement("group-preset").value = "sillamae-children";
    formElement("weekday").value = "1";
    formElement("repeat-weekly").checked = true;
    setWeekdays([1]);
    formElement("starts-on").value = dates.startOfWeek(dates.getTallinnToday());
    formElement("ends-on").value = "";
    formElement("date").value = dates.getTallinnToday();
    formElement("start").value = "17:00";
    formElement("end").value = "18:00";
    formElement("venue").value = "sillamae";
    formElement("status").value = "active";
    applyPreset("sillamae-children");
    app.querySelector("[data-schedule-language-details]").open = false;
    syncRecurrenceUi();
    setFormMode("session");
    if (shouldFocus) focusCustomSelect(formElement("group-preset"));
  }

  function detectPreset(item) {
    var found = "custom";
    Object.keys(PRESETS).some(function (key) {
      var preset = PRESETS[key];
      var textMatches = ["ru", "et", "en"].every(function (code) {
        return preset.title[code] === item.title[code] && preset.audience[code] === item.audience[code];
      });
      if (preset.venue === item.venue && textMatches) {
        found = key;
        return true;
      }
      return false;
    });
    return found;
  }

  function applyPreset(key) {
    var preset = PRESETS[key];
    if (!preset) {
      app.querySelector("[data-schedule-language-details]").open = true;
      refreshCustomSelects(false);
      return;
    }
    app.querySelector("[data-schedule-language-details]").open = false;
    formElement("venue").value = preset.venue;
    ["ru", "et", "en"].forEach(function (code) {
      formElement("title-" + code).value = preset.title[code];
      formElement("audience-" + code).value = preset.audience[code];
    });
    refreshCustomSelects(false);
  }

  function editSession(id) {
    var item = store.getSessions().find(function (candidate) { return candidate.id === id; });
    if (!item) return;
    editingId = item.id;
    editingTemplateId = "";
    placementTemplateId = "";
    editingTemplateDuration = 60;
    var preset = detectPreset(item);
    formElement("group-preset").value = preset;
    app.querySelector("[data-schedule-language-details]").open = preset === "custom";
    formElement("weekday").value = String(item.weekday);
    formElement("repeat-weekly").checked = item.recurrence !== "once";
    setWeekdays(item.weekdays || [item.weekday]);
    formElement("starts-on").value = item.startsOn || "";
    formElement("ends-on").value = item.endsOn || "";
    formElement("date").value = item.date || dates.getTallinnToday();
    syncRecurrenceUi();
    formElement("start").value = item.start;
    formElement("end").value = item.end;
    formElement("venue").value = item.venue;
    formElement("status").value = item.status;
    ["ru", "et", "en"].forEach(function (code) {
      formElement("title-" + code).value = item.title[code];
      formElement("audience-" + code).value = item.audience[code];
    });
    setFormMode("session");
    openSessionDialog(true);
  }

  function openNewSession(detail) {
    var candidate = detail && typeof detail === "object" ? detail : {};
    resetForm(false);
    var template = candidate.templateId && typeof store.getTemplates === "function"
      ? store.getTemplates().find(function (item) { return item.id === candidate.templateId; })
      : null;
    if (template) {
      placementTemplateId = template.id;
      applyTemplateToForm(template);
    }
    else if (candidate.venue === "narva") applyPreset("narva-children");
    else if (candidate.venue === "sillamae") applyPreset("sillamae-children");
    var weekday = Number(candidate.weekday);
    if (Number.isInteger(weekday) && weekday >= 1 && weekday <= 7) {
      formElement("weekday").value = String(weekday);
      setWeekdays([weekday]);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(candidate.date || ""))) {
      formElement("starts-on").value = candidate.date;
      formElement("date").value = candidate.date;
    }
    if (template) formElement("repeat-weekly").checked = false;
    syncRecurrenceUi();
    var candidateStart = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(candidate.start || ""))
      ? candidate.start
      : "";
    if (candidateStart) formElement("start").value = candidateStart;
    if (template) {
      formElement("end").value = endTimeForTemplate(template, formElement("start").value, candidate.end);
    } else if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(candidate.end || ""))) {
      formElement("end").value = candidate.end;
    }
    if (template) setFormMode("template-placement");
    refreshCustomSelects(false);
    openSessionDialog(true);
  }

  function templateById(id) {
    if (!id || typeof store.getTemplates !== "function") return null;
    return store.getTemplates().find(function (item) { return item.id === id; }) || null;
  }

  function openNewTemplate(detail) {
    var candidate = detail && typeof detail === "object" ? detail : {};
    resetForm(false);
    if (candidate.venue === "narva") applyPreset("narva-children");
    else if (candidate.venue === "sillamae") applyPreset("sillamae-children");
    setFormMode("template");
    openSessionDialog(true);
  }

  function editTemplate(id) {
    var item = templateById(id);
    if (!item) return;
    resetForm(false);
    editingTemplateId = item.id;
    editingTemplateDuration = Number.isInteger(item.durationMinutes) && item.durationMinutes > 0
      ? item.durationMinutes
      : 60;
    applyTemplateToForm(item);
    setFormMode("template");
    openSessionDialog(true);
  }

  function createButton(action, id, label, className, ariaLabel) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute(action, id);
    button.setAttribute("aria-label", ariaLabel || label);
    button.textContent = label;
    return button;
  }

  function renderEditorList() {
    var list = app.querySelector("[data-schedule-editor-list]");
    if (!list) return;
    list.replaceChildren();
    store.getSessions().sort(function (left, right) {
      var leftKey = left.recurrence === "once" ? left.date : "0000-00-0" + left.weekday;
      var rightKey = right.recurrence === "once" ? right.date : "0000-00-0" + right.weekday;
      return leftKey.localeCompare(rightKey) || left.start.localeCompare(right.start);
    }).forEach(function (item) {
      var card = document.createElement("article");
      card.className = "schedule-editor-item";
      card.setAttribute("data-schedule-item", "");
      card.setAttribute("data-schedule-id", item.id);
      var summary = document.createElement("div");
      summary.className = "schedule-editor-item__summary";
      var meta = document.createElement("span");
      var scheduleLabel = item.recurrence === "once"
        ? item.date + " · " + text("form.once")
        : (item.weekdays || [item.weekday]).map(function (day) { return DAY_NAMES[language][day]; }).join(" · ") + " · " + text("form.weekly");
      meta.textContent = scheduleLabel + " · " + item.start + "–" + item.end + " · " + (item.venue === "sillamae" ? "Sillamäe" : "Narva");
      var heading = document.createElement("strong");
      heading.textContent = item.title[language] || item.title.ru;
      summary.appendChild(meta);
      summary.appendChild(heading);
      if (item.status === "cancelled") {
        var cancelled = document.createElement("em");
        cancelled.textContent = text("actions.cancelled");
        summary.appendChild(cancelled);
      }
      var actions = document.createElement("div");
      actions.className = "schedule-editor-item__actions";
      var actionContext = heading.textContent + ", " + scheduleLabel + " " + item.start;
      actions.appendChild(createButton("data-schedule-edit", item.id, text("actions.edit"), "schedule-action schedule-action--edit", text("actions.edit") + ": " + actionContext));
      actions.appendChild(createButton("data-schedule-delete", item.id, text("actions.delete"), "schedule-action schedule-action--delete", text("actions.delete") + ": " + actionContext));
      card.appendChild(summary);
      card.appendChild(actions);
      list.appendChild(card);
    });
  }

  function showStatusMessage(message, action) {
    var node = app.querySelector("[data-schedule-status]");
    window.clearTimeout(statusTimer);
    node.replaceChildren();
    var messageNode = document.createElement("span");
    messageNode.className = "schedule-status__message";
    messageNode.textContent = message;
    node.appendChild(messageNode);
    var actions = Array.isArray(action) ? action : action ? [action] : [];
    var actionGroup = null;
    if (actions.length) {
      actionGroup = document.createElement("span");
      actionGroup.className = "schedule-status__actions";
      node.appendChild(actionGroup);
    }
    actions.forEach(function (currentAction) {
      if (!currentAction || typeof currentAction.callback !== "function") return;
      var actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "schedule-status__action";
      actionButton.textContent = currentAction.label;
      actionButton.addEventListener("click", currentAction.callback, { once: true });
      actionGroup.appendChild(actionButton);
    });
    // Retry and conflict choices must remain available until the sync state
    // changes; hiding them on a timer could strand an offline edit.
    statusTimer = actions.length
      ? null
      : window.setTimeout(function () { node.replaceChildren(); }, 6000);
  }

  function showStatus(messageKey, action) {
    showStatusMessage(text(messageKey), action);
  }

  var presentedSyncStatus = "loading";

  function runSyncAction(operation) {
    try {
      Promise.resolve(operation()).catch(function () {
        // The store emits the translated error state through subscribeSync.
      });
    } catch (error) {
      showStatus("sync.error", {
        label: text("sync.retry"),
        callback: function () { runSyncAction(store.retrySync); }
      });
    }
  }

  function presentSyncState(detail) {
    if (!detail || typeof detail.status !== "string") return;
    var previous = presentedSyncStatus;
    presentedSyncStatus = detail.status;

    if (detail.status === "saving" && detail.pending) {
      showStatus("sync.saving");
      return;
    }
    if (detail.status === "synced") {
      if (previous === "saving" || previous === "offline" || previous === "error" || previous === "conflict") {
        showStatus("sync.synced");
      }
      return;
    }
    if (detail.status === "offline") {
      showStatus("sync.offline", {
        label: text("sync.retry"),
        callback: function () { runSyncAction(store.retrySync); }
      });
      return;
    }
    if (detail.status === "conflict") {
      showStatus("sync.conflict", [
        {
          label: text("sync.useCloud"),
          callback: function () {
            runSyncAction(function () { return store.resolveConflict("remote"); });
          }
        },
        {
          label: text("sync.useLocal"),
          callback: function () {
            runSyncAction(function () { return store.resolveConflict("local"); });
          }
        }
      ]);
      return;
    }
    if (detail.status === "error") {
      showStatus("sync.error", {
        label: text("sync.retry"),
        callback: function () { runSyncAction(store.retrySync); }
      });
    }
  }

  function showError(error, context) {
    var selector = context === "form" ? "[data-schedule-form-error]" : "[data-schedule-import-error]";
    var node = app.querySelector(selector) || app.querySelector("[data-schedule-import-error]") || app.querySelector("[data-schedule-form-error]");
    if (!node) {
      showStatusMessage(text("error.prefix") + (error && error.message ? error.message : String(error)));
      return;
    }
    node.textContent = error && error.code === "SCHEDULE_STORAGE_UNAVAILABLE"
      ? text("error.storage")
      : text("error.prefix") + (error && error.message ? error.message : String(error));
    node.focus();
  }

  function clearError() {
    Array.prototype.forEach.call(app.querySelectorAll("[data-schedule-import-error], [data-schedule-form-error]"), function (node) {
      node.textContent = "";
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    clearError();
    try {
      if (formMode === "template") {
        store.upsertTemplate(readTemplateForm());
      } else {
        store.upsert(readForm());
      }
      var savedTemplate = formMode === "template";
      resetForm(false);
      renderEditorList();
      closeSessionDialog(true);
      showStatus(savedTemplate ? "status.templateSaved" : "status.saved");
    } catch (error) {
      showError(error, "form");
    }
  }

  function handleEditorClick(event) {
    var edit = event.target.closest && event.target.closest("[data-schedule-edit]");
    var remove = event.target.closest && event.target.closest("[data-schedule-delete]");
    if (edit) {
      editSession(edit.getAttribute("data-schedule-edit"));
      return;
    }
    if (remove && window.confirm(text("confirm.delete"))) {
      clearError();
      try {
        store.remove(remove.getAttribute("data-schedule-delete"));
        if (editingId === remove.getAttribute("data-schedule-delete")) resetForm(false);
        renderEditorList();
        showStatus("status.deleted");
      } catch (error) {
        showError(error);
      }
    }
  }

  function deleteCurrentSession() {
    if (formMode === "template") {
      deleteTemplate(editingTemplateId, true);
      return;
    }
    if (!editingId || !window.confirm(text("confirm.delete"))) return;
    clearError();
    try {
      store.remove(editingId);
      resetForm(false);
      renderEditorList();
      closeSessionDialog(true);
      showStatus("status.deleted");
    } catch (error) {
      showError(error, "form");
    }
  }

  function deleteTemplate(id, closeCurrentDialog) {
    if (!id || typeof store.removeTemplate !== "function" || !window.confirm(text("confirm.deleteTemplate"))) return;
    clearError();
    try {
      store.removeTemplate(id);
      var deletingCurrent = formMode === "template" && editingTemplateId === id;
      if (deletingCurrent) resetForm(false);
      if (closeCurrentDialog && deletingCurrent) closeSessionDialog(true);
      showStatus("status.templateDeleted");
    } catch (error) {
      showError(error, closeCurrentDialog ? "form" : undefined);
    }
  }

  function cancelSessionEditing() {
    clearError();
    resetForm(false);
    closeSessionDialog(true);
  }

  function bindDialog(dialog, kind) {
    if (!dialog) return;
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeAllCustomSelects(true);
      if (kind === "session") cancelSessionEditing();
      else closeManageDialog(true);
    });
    dialog.addEventListener("close", function () {
      closeAllCustomSelects(true);
      dialog.removeAttribute("data-schedule-fallback-open");
      syncDialogState();
      if (consumeSuppressedDialogRestore(dialog) || anyDialogIsOpen()) return;
      restoreDialogFocus(dialog);
    });
  }

  function importText(raw) {
    clearError();
    try {
      store.importJSON(raw);
      resetForm(false);
      renderEditorList();
      showStatus("status.imported");
    } catch (error) {
      showError(error);
    }
  }

  function handleImportFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 100000) {
      showError(new Error("JSON file is too large"));
      event.target.value = "";
      return;
    }
    var reader = new FileReader();
    reader.addEventListener("load", function () {
      importText(String(reader.result || ""));
      event.target.value = "";
    });
    reader.addEventListener("error", function () {
      showError(new Error("Could not read the file"));
      event.target.value = "";
    });
    reader.readAsText(file);
  }

  function exportSchedule() {
    var blob = new Blob([store.exportJSON()], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "dzhikaeva-schedule-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    showStatus("status.exported");
  }

  function isStandalone() {
    var displayMode = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
    return displayMode || window.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  }

  function refreshInstallUi() {
    var button = app.querySelector("[data-schedule-install]");
    var help = app.querySelector("[data-schedule-install-help]");
    if (!button) return;
    var standalone = isStandalone();
    button.disabled = standalone;
    button.setAttribute("aria-disabled", String(standalone));
    button.querySelector("span").textContent = text(standalone ? "hero.installed" : "hero.install");
    if (help) {
      help.textContent = isIos() && !standalone ? text("install.ios") : "";
      help.hidden = !help.textContent;
    }
  }

  function installApp() {
    if (isStandalone()) return;
    if (!deferredInstallPrompt) {
      var help = app.querySelector("[data-schedule-install-help]");
      help.textContent = text(isIos() ? "install.ios" : "install.generic");
      help.hidden = false;
      help.focus();
      return;
    }
    showStatus("status.installing");
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function () {
      deferredInstallPrompt = null;
      refreshInstallUi();
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !/^\/schedule(?:\/|$)/.test(window.location.pathname)) return;
    navigator.serviceWorker.register("/schedule/sw.js", { scope: "/schedule/" }).then(function (registration) {
      if (registration.waiting) showStatus("status.update");
      registration.addEventListener("updatefound", function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showStatus("status.update");
        });
      });
    }).catch(function () {
      // The online schedule remains fully usable if PWA installation is unavailable.
    });
  }

  app.addEventListener("click", function (event) {
    var logoutButton = event.target.closest && event.target.closest("[data-schedule-logout]");
    if (logoutButton) {
      logout(logoutButton);
      return;
    }
    var sessionDialog = getSessionDialog();
    var manageDialog = getManageDialog();
    var closeSession = event.target.closest && event.target.closest("[data-schedule-close-session]");
    var closeManage = event.target.closest && event.target.closest("[data-schedule-close-manage]");
    var genericClose = event.target.closest && event.target.closest("[data-schedule-modal-close]");
    if (closeSession || (genericClose && genericClose.closest("[data-schedule-session-dialog]"))) {
      event.preventDefault();
      cancelSessionEditing();
      return;
    }
    if (closeManage || (genericClose && genericClose.closest("[data-schedule-manage-dialog]"))) {
      event.preventDefault();
      closeManageDialog(true);
      return;
    }
    if (event.target === sessionDialog) {
      cancelSessionEditing();
      return;
    }
    if (event.target === manageDialog) {
      closeManageDialog(true);
      return;
    }
    if (event.target.closest && event.target.closest("[data-schedule-delete-current]")) {
      deleteCurrentSession();
      return;
    }
    if (event.target.closest && event.target.closest("[data-schedule-open-manage]")) {
      openManageDialog(true);
      return;
    }
    if (event.target.closest && event.target.closest("[data-schedule-export]")) exportSchedule();
    if (event.target.closest && event.target.closest("[data-schedule-import-text-button]")) {
      importText(app.querySelector("[data-schedule-import-text]").value);
    }
    if (event.target.closest && event.target.closest("[data-schedule-reset]")) {
      if (window.confirm(text("confirm.reset"))) {
        clearError();
        try {
          store.reset();
          resetForm(false);
          renderEditorList();
          showStatus("status.reset");
        } catch (error) {
          showError(error);
        }
      }
    }
    if (event.target.closest && event.target.closest("[data-schedule-restore]")) {
      if (window.confirm(text("confirm.restore"))) {
        try {
          store.restoreBackup();
          resetForm(false);
          renderEditorList();
          showStatus("status.restored");
        } catch (error) {
          showError(error);
        }
      }
    }
    if (event.target.closest && event.target.closest("[data-schedule-install]")) installApp();
  });
  app.addEventListener("click", handleEditorClick);
  var outsideCustomSelectEvent = "PointerEvent" in window ? "pointerdown" : "mousedown";
  document.addEventListener(outsideCustomSelectEvent, function (event) {
    if (!openCustomSelectController) return;
    if (openCustomSelectController.wrapper.contains(event.target)) return;
    closeCustomSelect(openCustomSelectController, false, false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !openCustomSelectController) return;
    event.preventDefault();
    closeCustomSelect(openCustomSelectController, true, false);
  });
  app.querySelector("[data-schedule-form]").addEventListener("submit", handleSubmit);
  app.querySelector("[data-schedule-import]").addEventListener("change", handleImportFile);
  formElement("group-preset").addEventListener("change", function (event) {
    applyPreset(event.target.value);
  });
  formElement("repeat-weekly").addEventListener("change", syncRecurrenceUi);
  formElement("weekday").addEventListener("change", function (event) {
    setPrimaryWeekday(event.target.value);
  });
  app.querySelector("[data-schedule-weekdays]").addEventListener("change", function (event) {
    if (!event.target.matches('input[name="weekdays"]')) return;
    var values = selectedWeekdays();
    if (!values.length) {
      event.target.checked = true;
      values = selectedWeekdays();
    }
    formElement("weekday").value = String(values[0]);
  });
  formElement("date").addEventListener("change", function (event) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) {
      formElement("weekday").value = String(dates.dateToWeekday(event.target.value));
    }
  });

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    refreshInstallUi();
  });
  window.addEventListener("appinstalled", refreshInstallUi);
  window.addEventListener("site:languagechange", function (event) {
    applyLanguage(event.detail && event.detail.language);
  });
  window.addEventListener("dzhikaeva:templatecreate", function (event) {
    openNewTemplate(event.detail);
  });
  window.addEventListener("dzhikaeva:templateedit", function (event) {
    var detail = event.detail || {};
    editTemplate(detail.id || detail.templateId);
  });
  window.addEventListener("dzhikaeva:templatedelete", function (event) {
    var detail = event.detail || {};
    deleteTemplate(detail.id || detail.templateId, false);
  });
  window.addEventListener("dzhikaeva:scheduleedit", function (event) {
    if (event.detail && event.detail.id) editSession(event.detail.id);
  });
  window.addEventListener("dzhikaeva:schedulenew", function (event) {
    openNewSession(event.detail);
  });
  window.addEventListener("dzhikaeva:schedulemove", function (event) {
    var previous = event.detail && event.detail.before;
    showStatus("status.moved", previous ? {
      label: text("actions.undo"),
      callback: function () {
        try {
          store.upsert(previous);
          showStatus("status.undone");
        } catch (error) {
          showStatusMessage(error && error.code === "SCHEDULE_STORAGE_UNAVAILABLE" ? text("error.storage") : text("error.prefix") + (error.message || String(error)));
        }
      }
    } : null);
  });
  window.addEventListener("dzhikaeva:scheduleerror", function (event) {
    var error = event.detail && event.detail.error;
    showStatusMessage(error && error.code === "SCHEDULE_STORAGE_UNAVAILABLE" ? text("error.storage") : text("error.prefix") + (error && error.message ? error.message : String(error || "")));
  });
  store.subscribe(function () { renderEditorList(); });
  if (typeof store.subscribeSync === "function") {
    store.subscribeSync(presentSyncState);
    presentSyncState(store.getSyncState());
  }

  bindDialog(getSessionDialog(), "session");
  bindDialog(getManageDialog(), "manage");
  refreshCustomSelects(false);
  var initialUi = store.getUi();
  var initialMode = new URLSearchParams(window.location.search).get("edit") === "1" ? "editor" : "schedule";
  var startupLanguage = /^\/schedule\/?$/.test(window.location.pathname)
    ? normaliseLanguage(initialUi.language)
    : languageFromPath();
  store.setUi({ mode: "schedule" });
  resetForm(false);
  applyLanguage(startupLanguage);
  setMode(initialMode, false);
  var authCheck = verifyEditorSession();

  var ready = window.siteI18n && window.siteI18n.ready ? window.siteI18n.ready : Promise.resolve();
  var scheduleReady = store.ready && typeof store.ready.then === "function" ? store.ready : Promise.resolve();
  Promise.resolve(ready).then(function () {
    if (window.siteI18n && window.siteI18n.language !== startupLanguage) {
      return window.siteI18n.switchLanguage(startupLanguage, { history: "replace" });
    }
    return null;
  }).catch(function () {
    // Keep the current language usable if a locale pack cannot be loaded.
  }).then(function () {
    applyLanguage(window.siteI18n ? window.siteI18n.language : startupLanguage);
    return Promise.all([authCheck, scheduleReady]);
  }).then(function () {
    registerServiceWorker();
    app.setAttribute("data-schedule-storage-key", store.storageKey);
    app.setAttribute("data-schedule-ready", "true");
    app.setAttribute("aria-busy", "false");
    if (syncLockedCalendar) syncLockedCalendar.removeAttribute("inert");
    if (syncLockedManageButton) syncLockedManageButton.disabled = false;
    window.scheduleApp = Object.freeze({ ready: true, storageKey: store.storageKey });
  });
}());
