/**
 * Shared Google reCAPTCHA v2 (checkbox) helper for the storefront forms.
 *
 * Only stores in ENABLED_DOMAINS get a CAPTCHA; every other store returns early. No API
 * call is made, and Google's script is injected only once per page however many forms
 * mount a widget. Keep ENABLED_DOMAINS in sync with recaptcha.contact_form_stores on the backend,
 * which is what actually enforces the CAPTCHA.
 *
 *   const handle = await StRecaptcha.mount(containerEl, { onChange });
 *   handle === null            -> CAPTCHA not required for this store
 *   handle.getToken()          -> '' until the checkbox is completed
 *   handle.reset()             -> call after every submit attempt (tokens are single use)
 *
 * SITE_KEY is Google's public key and is safe to ship; the secret key stays on the backend.
 */
(function () {
    if (window.StRecaptcha) return;

    const SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit&onload=stRecaptchaOnload';
    const SITE_KEY = '6LczkAwuAAAAAKIPZnS4dEd_RNugutWs_wm2Uyfi';
    let scriptPromise = null;

    // Only these stores show the CAPTCHA. Both the myshopify domain and the custom
    // domain are listed, since Shopify.shop is always the myshopify one.
    const ENABLED_DOMAINS = [
        'littlebluemarket.com',
        'unique-production-store-zanokvaf.myshopify.com',
        'unique-staging-store.myshopify.com',
        'little-blue-cart-dev.myshopify.com'
    ];

    function isEnabledStore() {
        const shop = ((window.Shopify && window.Shopify.shop) || '').toLowerCase();
        const host = window.location.hostname.toLowerCase().replace(/^www\./, '');
        return ENABLED_DOMAINS.indexOf(shop) !== -1 || ENABLED_DOMAINS.indexOf(host) !== -1;
    }

    function loadScript() {
        if (scriptPromise) return scriptPromise;
        scriptPromise = new Promise(function (resolve, reject) {
            if (window.grecaptcha && window.grecaptcha.render) return resolve();
            window.stRecaptchaOnload = resolve;
            const s = document.createElement('script');
            s.src = SCRIPT_SRC;
            s.async = true;
            s.defer = true;
            s.onerror = function () { scriptPromise = null; reject(new Error('recaptcha script failed')); };
            document.head.appendChild(s);
        });
        return scriptPromise;
    }

    async function mount(container, options) {
        options = options || {};
        // Other stores never load Google's script.
        if (!container || !isEnabledStore()) return null;

        // One widget per container, even if the form re-renders or mount is called twice.
        if (container.__stRecaptcha) return container.__stRecaptcha;

        await loadScript();
        if (container.__stRecaptcha) return container.__stRecaptcha;

        const widgetId = window.grecaptcha.render(container, {
            sitekey: SITE_KEY,
            callback: function () { if (options.onChange) options.onChange(true); },
            'expired-callback': function () { if (options.onChange) options.onChange(false); },
            'error-callback': function () { if (options.onChange) options.onChange(false); }
        });

        const handle = {
            getToken: function () { return window.grecaptcha.getResponse(widgetId) || ''; },
            reset: function () {
                window.grecaptcha.reset(widgetId);
                if (options.onChange) options.onChange(false);
            }
        };
        container.__stRecaptcha = handle;
        return handle;
    }

    window.StRecaptcha = { mount: mount };
})();
