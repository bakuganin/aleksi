(function (root, factory) {
  "use strict";

  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.DzhikaevaScheduleDates = Object.freeze(api);
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var DAY_MS = 24 * 60 * 60 * 1000;
  var MIN_YEAR = 1900;
  var MAX_YEAR = 2200;
  var TIME_ZONE = "Europe/Tallinn";
  var ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  var SUPPORTED_LANGUAGES = { ru: true, et: true, en: true };

  var HOLIDAY_NAMES = {
    ru: {
      newYear: "Новый год",
      independence: "День независимости Эстонии",
      goodFriday: "Страстная пятница",
      easterSunday: "Пасхальное воскресенье",
      springDay: "Праздник весны",
      pentecost: "Троица",
      victoryDay: "День победы",
      midsummerDay: "Иванов день",
      restoration: "День восстановления независимости",
      christmasEve: "Сочельник",
      christmasDay: "Рождество",
      boxingDay: "Второй день Рождества"
    },
    et: {
      newYear: "Uusaasta",
      independence: "Iseseisvuspäev, Eesti Vabariigi aastapäev",
      goodFriday: "Suur reede",
      easterSunday: "Ülestõusmispühade 1. püha",
      springDay: "Kevadpüha",
      pentecost: "Nelipühade 1. püha",
      victoryDay: "Võidupüha",
      midsummerDay: "Jaanipäev",
      restoration: "Taasiseseisvumispäev",
      christmasEve: "Jõululaupäev",
      christmasDay: "Esimene jõulupüha",
      boxingDay: "Teine jõulupüha"
    },
    en: {
      newYear: "New Year's Day",
      independence: "Independence Day, anniversary of the Republic of Estonia",
      goodFriday: "Good Friday",
      easterSunday: "Easter Sunday",
      springDay: "Spring Day",
      pentecost: "Pentecost",
      victoryDay: "Victory Day",
      midsummerDay: "Midsummer Day",
      restoration: "Day of Restoration of Independence",
      christmasEve: "Christmas Eve",
      christmasDay: "Christmas Day",
      boxingDay: "Boxing Day"
    }
  };

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function validateYear(year) {
    var numericYear = Number(year);

    if (
      !isFinite(numericYear) ||
      Math.floor(numericYear) !== numericYear ||
      numericYear < MIN_YEAR ||
      numericYear > MAX_YEAR
    ) {
      throw new RangeError("Year must be an integer between " + MIN_YEAR + " and " + MAX_YEAR);
    }

    return numericYear;
  }

  function parseIsoDate(value) {
    var match;
    var year;
    var month;
    var day;
    var date;

    if (typeof value !== "string") {
      throw new TypeError("Date must use the YYYY-MM-DD format");
    }

    match = ISO_DATE_PATTERN.exec(value);
    if (!match) {
      throw new RangeError("Date must use the YYYY-MM-DD format");
    }

    year = validateYear(Number(match[1]));
    month = Number(match[2]);
    day = Number(match[3]);
    date = new Date(Date.UTC(year, month - 1, day));

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new RangeError("Date must be a real Gregorian calendar date");
    }

    return date;
  }

  function isValidIsoDate(value) {
    try {
      parseIsoDate(value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function isoDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new TypeError("isoDate() expects a valid Date");
    }

    validateYear(date.getUTCFullYear());

    return [
      date.getUTCFullYear(),
      pad2(date.getUTCMonth() + 1),
      pad2(date.getUTCDate())
    ].join("-");
  }

  function addDays(value, amount) {
    var days = Number(amount);
    var date;
    var result;

    if (!isFinite(days) || Math.floor(days) !== days || Math.abs(days) > 366000) {
      throw new RangeError("Day offset must be a reasonable whole number");
    }

    date = parseIsoDate(value);
    result = new Date(date.getTime() + days * DAY_MS);
    validateYear(result.getUTCFullYear());
    return isoDate(result);
  }

  function dateToWeekday(value) {
    var weekday = parseIsoDate(value).getUTCDay();
    return weekday === 0 ? 7 : weekday;
  }

  function startOfWeek(value) {
    return addDays(value, 1 - dateToWeekday(value));
  }

  function weekDates(value) {
    var monday = startOfWeek(value);
    var dates = [];
    var index;

    for (index = 0; index < 7; index += 1) {
      dates.push(addDays(monday, index));
    }

    return dates;
  }

  function getTallinnToday(now) {
    var date = typeof now === "undefined" ? new Date() : now;
    var formatter;
    var parts;
    var values = {};
    var index;
    var formatted;
    var match;

    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new TypeError("getTallinnToday() expects a valid Date");
    }

    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    if (typeof formatter.formatToParts === "function") {
      parts = formatter.formatToParts(date);
      for (index = 0; index < parts.length; index += 1) {
        if (parts[index].type === "year" || parts[index].type === "month" || parts[index].type === "day") {
          values[parts[index].type] = parts[index].value;
        }
      }

      if (values.year && values.month && values.day) {
        return values.year + "-" + values.month + "-" + values.day;
      }
    }

    formatted = formatter.format(date);
    match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(formatted);
    if (!match) {
      throw new Error("Unable to resolve the local date in Europe/Tallinn");
    }

    return match[3] + "-" + match[2] + "-" + match[1];
  }

  function gregorianEasterSunday(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(Date.UTC(year, month - 1, day));
  }

  function holiday(date, key, name) {
    return {
      date: date,
      key: key,
      name: name
    };
  }

  function getEstonianPublicHolidays(year, language) {
    var safeYear = validateYear(year);
    var lang = SUPPORTED_LANGUAGES[language] ? language : "ru";
    var names = HOLIDAY_NAMES[lang];
    var easter = gregorianEasterSunday(safeYear);
    var easterIso = isoDate(easter);
    var holidays = [
      holiday(safeYear + "-01-01", "new-year", names.newYear),
      holiday(safeYear + "-02-24", "independence-day", names.independence),
      holiday(addDays(easterIso, -2), "good-friday", names.goodFriday),
      holiday(easterIso, "easter-sunday", names.easterSunday),
      holiday(safeYear + "-05-01", "spring-day", names.springDay),
      holiday(addDays(easterIso, 49), "pentecost", names.pentecost),
      holiday(safeYear + "-06-23", "victory-day", names.victoryDay),
      holiday(safeYear + "-06-24", "midsummer-day", names.midsummerDay),
      holiday(safeYear + "-08-20", "restoration-day", names.restoration),
      holiday(safeYear + "-12-24", "christmas-eve", names.christmasEve),
      holiday(safeYear + "-12-25", "christmas-day", names.christmasDay),
      holiday(safeYear + "-12-26", "boxing-day", names.boxingDay)
    ];

    holidays.sort(function (left, right) {
      return left.date < right.date ? -1 : left.date > right.date ? 1 : 0;
    });

    return holidays;
  }

  function recurrenceMode(session) {
    var recurrence = session.recurrence;

    if (typeof recurrence === "string") {
      return recurrence.toLowerCase();
    }

    if (recurrence && typeof recurrence === "object") {
      return String(recurrence.mode || recurrence.frequency || recurrence.type || "").toLowerCase();
    }

    if (typeof session.weekday !== "undefined" || Array.isArray(session.weekdays)) {
      return "weekly";
    }

    if (session.date) {
      return "once";
    }

    return "";
  }

  function weeklyDays(session) {
    var recurrence = session.recurrence;
    var values = Array.isArray(session.weekdays) ? session.weekdays : null;
    var result = [];
    var seen = {};
    var index;
    var value;

    if (!values && recurrence && typeof recurrence === "object" && Array.isArray(recurrence.weekdays)) {
      values = recurrence.weekdays;
    }
    if (!values && typeof session.weekday !== "undefined") {
      values = [session.weekday];
    }
    if (!values) {
      return result;
    }

    for (index = 0; index < values.length; index += 1) {
      value = Number(values[index]);
      if (Math.floor(value) === value && value >= 1 && value <= 7 && !seen[value]) {
        seen[value] = true;
        result.push(value);
      }
    }

    return result;
  }

  function occurrenceForDate(session, value) {
    var date = isoDate(parseIsoDate(value));
    var mode;
    var weekdays;
    var weekday;
    var seriesId;
    var occurrence;
    var key;

    if (!session || typeof session !== "object" || Array.isArray(session)) {
      return null;
    }

    mode = recurrenceMode(session);
    if (mode === "once") {
      if (!isValidIsoDate(session.date) || session.date !== date) {
        return null;
      }
    } else if (mode === "weekly") {
      if (session.startsOn && (!isValidIsoDate(session.startsOn) || date < session.startsOn)) {
        return null;
      }
      if (session.endsOn && (!isValidIsoDate(session.endsOn) || date > session.endsOn)) {
        return null;
      }

      weekdays = weeklyDays(session);
      weekday = dateToWeekday(date);
      if (weekdays.indexOf(weekday) === -1) {
        return null;
      }
    } else {
      return null;
    }

    occurrence = {};
    for (key in session) {
      if (Object.prototype.hasOwnProperty.call(session, key)) {
        occurrence[key] = session[key];
      }
    }

    seriesId = String(session.seriesId || session.id || "schedule-session");
    occurrence.date = date;
    occurrence.weekday = dateToWeekday(date);
    occurrence.seriesId = seriesId;
    occurrence.occurrenceId = seriesId + "@" + date;

    return occurrence;
  }

  return {
    getTallinnToday: getTallinnToday,
    isoDate: isoDate,
    startOfWeek: startOfWeek,
    addDays: addDays,
    weekDates: weekDates,
    dateToWeekday: dateToWeekday,
    getEstonianPublicHolidays: getEstonianPublicHolidays,
    occurrenceForDate: occurrenceForDate
  };
});
