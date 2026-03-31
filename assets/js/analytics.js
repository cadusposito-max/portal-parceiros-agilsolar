// ==========================================
// ANALYTICS (PostHog) - integração centralizada
// ==========================================

(function analyticsBootstrap() {
  const POSTHOG_TOKEN = 'phc_yXk1BoFAaWz8OhP1c5OEkThOsrHpAG5qwHQiw0nTYtS';
  const POSTHOG_HOST = 'https://us.i.posthog.com';
  const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

  const allowedEventProps = new Set([
    'source',
    'mode',
    'flow',
    'result',
    'step',
    'mfa_required',
  ]);

  const sensitiveKeyPatterns = [
    /email/i,
    /phone/i,
    /telefone/i,
    /celular/i,
    /nome/i,
    /name/i,
    /cliente/i,
    /customer/i,
    /vendedor/i,
    /proposal/i,
    /proposta/i,
    /uuid/i,
    /token/i,
    /senha/i,
    /password/i,
    /cpf/i,
    /cnpj/i,
  ];

  let initialized = false;
  let enabled = false;
  let currentMode = 'internal';

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isSensitiveKey(key) {
    if (!key) return false;
    if (/(_|^)id$/i.test(key)) return true;
    return sensitiveKeyPatterns.some((pattern) => pattern.test(key));
  }

  function stripQueryAndHash(urlValue) {
    try {
      const parsed = new URL(String(urlValue), window.location.origin);
      return `${parsed.origin}${parsed.pathname}`;
    } catch (_) {
      return String(urlValue || '').split('?')[0].split('#')[0];
    }
  }

  function sanitizePrimitive(value) {
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return value.slice(0, 120);
    return undefined;
  }

  function sanitizeEventProperties(rawProps) {
    if (!isObject(rawProps)) return {};
    const sanitized = {};
    const entries = Object.entries(rawProps);

    for (const [key, value] of entries) {
      if (!allowedEventProps.has(key)) continue;
      if (isSensitiveKey(key)) continue;
      const safeValue = sanitizePrimitive(value);
      if (typeof safeValue !== 'undefined') sanitized[key] = safeValue;
    }

    return sanitized;
  }

  function sanitizeBeforeSend(event) {
    if (!isObject(event)) return event;
    const output = { ...event };
    const props = isObject(output.properties) ? { ...output.properties } : {};
    const nextProps = {};

    for (const [key, value] of Object.entries(props)) {
      if (key === '$current_url' || key === '$referrer') {
        if (typeof value === 'string') nextProps[key] = stripQueryAndHash(value);
        continue;
      }

      // Não filtra campos internos do SDK para evitar quebrar autenticação/ingestão.
      nextProps[key] = value;
    }

    output.properties = nextProps;
    return output;
  }

  function canTrackCurrentHost() {
    const host = String(window.location.hostname || '').toLowerCase();
    return !LOCALHOST_HOSTS.has(host);
  }

  function buildInitConfig(mode) {
    const isInternalMode = mode === 'internal';

    return {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: isInternalMode ? 'history_change' : false,
      capture_pageleave: isInternalMode ? 'if_capture_pageview' : false,
      autocapture: false,
      capture_dead_clicks: false,
      capture_exceptions: isInternalMode,
      error_tracking: {
        captureExtensionExceptions: false,
      },
      disable_session_recording: !isInternalMode,
      session_recording: {
        // Session replay para debug: campos nao sensiveis visiveis; senha e email continuam mascarados.
        maskAllInputs: false,
        maskTextSelector: '*',
        maskInputOptions: {
          color: true,
          date: true,
          'datetime-local': true,
          email: true,
          month: true,
          number: true,
          range: true,
          search: false,
          tel: true,
          text: false,
          time: true,
          url: false,
          week: true,
          textarea: false,
          select: false,
          password: true,
        },
      },
      disable_surveys: true,
      mask_all_text: false,
      mask_all_element_attributes: true,
      mask_personal_data_properties: true,
      before_send: sanitizeBeforeSend,
    };
  }

  function initAnalytics(options) {
    const mode = options && options.mode === 'public' ? 'public' : 'internal';
    if (initialized) return enabled;

    if (!canTrackCurrentHost()) {
      initialized = true;
      enabled = false;
      currentMode = mode;
      return false;
    }

    if (!window.posthog || typeof window.posthog.init !== 'function') {
      initialized = true;
      enabled = false;
      currentMode = mode;
      console.warn('[analytics] PostHog SDK não disponível.');
      return false;
    }

    try {
      window.posthog.init(POSTHOG_TOKEN, buildInitConfig(mode));
      initialized = true;
      enabled = true;
      currentMode = mode;
      return true;
    } catch (error) {
      initialized = true;
      enabled = false;
      currentMode = mode;
      console.error('[analytics] Falha ao inicializar PostHog:', error);
      return false;
    }
  }

  function identifyUser(user) {
    if (!enabled || !initialized || currentMode !== 'internal') return;
    if (!window.posthog || typeof window.posthog.identify !== 'function') return;

    const distinctId = String(user && user.id ? user.id : '').trim();
    if (!distinctId) return;

    const role = String(user?.app_metadata?.role || '').trim();
    const personProps = role ? { role } : {};

    try {
      window.posthog.identify(distinctId, personProps);
    } catch (_) {
      // noop
    }
  }

  function resetUser() {
    if (!enabled || !initialized || !window.posthog || typeof window.posthog.reset !== 'function') return;
    try {
      window.posthog.reset();
    } catch (_) {
      // noop
    }
  }

  function captureEvent(eventName, properties) {
    if (!enabled || !initialized || !window.posthog || typeof window.posthog.capture !== 'function') return;
    const normalizedName = String(eventName || '').trim();
    if (!normalizedName) return;

    try {
      window.posthog.capture(normalizedName, sanitizeEventProperties(properties));
    } catch (_) {
      // noop
    }
  }

  function captureException(error, properties) {
    if (!enabled || !initialized || !window.posthog) return;
    const safeProps = sanitizeEventProperties(properties);

    try {
      if (typeof window.posthog.captureException === 'function') {
        window.posthog.captureException(error, safeProps);
      }
    } catch (_) {
      // noop
    }
  }

  window.initAnalytics = initAnalytics;
  window.identifyUser = identifyUser;
  window.resetUser = resetUser;
  window.captureEvent = captureEvent;
  window.captureException = captureException;
})();
