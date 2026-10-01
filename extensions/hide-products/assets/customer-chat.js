function getShopifyLocale() {
    const shopifyLocale = document.documentElement.lang ||
                          document.querySelector('html')?.getAttribute('lang') ||
                          window.Shopify?.locale ||
                          navigator.language.split('-')[0]
    const supportedLocales = ['en', 'de', 'es', 'nl', 'pt', 'no', 'ro']
    const localeAliases = { nb: 'no' }
    const baseLocale = shopifyLocale.toLowerCase().split('-')[0]
    const normalizedLocale = localeAliases[baseLocale] ?? baseLocale
    return supportedLocales.includes(normalizedLocale) ? normalizedLocale : 'en'
}

async function loadCustomerChatMessages(app) {
    const locale = getShopifyLocale()
    try {
        const langJSONUrl = app.getAttribute('data-lang-asset')
        if (!langJSONUrl) return {}
        const allMessages = await fetch(langJSONUrl).then(r => r.json())
        return {
            ...(allMessages.en?.['customer-chat'] || {}),
            ...(allMessages[locale]?.['customer-chat'] || {})
        }
    } catch (error) {
        console.error('customer-chat: failed to load locale messages', error)
        return {}
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// Inject the dynamic block-setting values as CSS variables (CSS rules live in customer-chat.css)
function applyChatStyles(settings) {
    const root = document.documentElement.style
    root.setProperty('--st-chat-popup-bg', settings.stChatPopupBgColor)
    root.setProperty('--st-chat-popup-color', settings.stPopupTxtColor)
    root.setProperty('--st-chat-cta-bg', settings.stChatWithSellerBtnBgColor)
    root.setProperty('--st-chat-cta-color', settings.stChatWithSellerBtnTxtColor)
    root.setProperty('--st-chat-cta-min-height', settings.stChatBtnHeight + 'px')
    root.setProperty('--st-chat-cta-font-size', settings.stChatCtaFontSize + 'px')
    root.setProperty('--st-chat-font-size', settings.stChatFontSize + 'px')
    root.setProperty('--st-chat-submit-color', settings.stChatSubmitBtnTxtColor)
    root.setProperty('--st-chat-submit-bg', settings.stChatSubmitBtnBgColor)
    root.setProperty('--st-chat-submit-font-size', settings.stChatSubmitBtnFontSize + 'px')
}

function renderChat(app, settings, t, customerEmail) {
    const ctaText = settings.stChatWithSellerBtnTxt === 'Chat With Seller' ? t.chatWithSeller : settings.stChatWithSellerBtnTxt
    const headerText = settings.stChatHeaderText === 'Chat With Seller' ? t.chatWithSeller : settings.stChatHeaderText
    const verificationRequired = !!settings.stChatEmailVerificationRequired

    const emailField = verificationRequired ? `
                <div>
                    <label for="chat-customer-email">${escapeHtml(t.email)}*</label>
                    <div class="st-chat-email-group">
                        <input name="chat-customer-email" id="chat-customer-email" type="email" value="${escapeHtml(customerEmail)}" placeholder="${escapeHtml(t.emailPlaceholder)}"/>
                        <button type="button" id="st-chat-verify-email-btn" class="st-chat-verify-email-btn">${escapeHtml(t.verifyEmail)}</button>
                    </div>
                </div>
                <div class="st-chat-code-section" id="st-chat-code-section">
                    <label>${escapeHtml(t.enterCode)}</label>
                    <div class="st-chat-code-inputs" id="st-chat-code-inputs">
                        ${Array.from({ length: 6 }, (_, i) => `<input type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code" class="st-chat-code-input" data-index="${i}" aria-label="${escapeHtml(t.enterCode)} ${i + 1}" disabled/>`).join('')}
                    </div>
                    <div class="st-chat-code-footer">
                        <p class="st-chat-code-hint" id="st-chat-code-hint">${escapeHtml(t.codeHint)}</p>
                        <button type="button" id="st-chat-verify-code-btn" class="st-chat-verify-code-btn" hidden disabled>${escapeHtml(t.verify)}</button>
                    </div>
                </div>` : `
                <div>
                    <label for="chat-customer-email">${escapeHtml(t.email)}*</label>
                    <input name="chat-customer-email" id="chat-customer-email" type="email" value="${escapeHtml(customerEmail)}"/>
                </div>`

    app.innerHTML = `
    <input type="hidden" name="shipturtle_customer_chat" id="shipturtle_customer_chat" value="${escapeHtml(customerEmail)}" />
    <div class="st-customer-chat-cta-section" id="st-customer-chat-cta">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
        <p class="chat-with-seller-btn">${escapeHtml(ctaText)}</p>
    </div>
    <div class="chat-with-seller-container" id="chat-with-seller-container">
        <div class="chat-with-seller">
            <div class="chat-with-seller-header">
                <p class="chat-with-seller-header-title">${escapeHtml(headerText)}</p>
                <p class="st-chat-with-seller-close" id="st-chat-with-seller-close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                </p>
            </div>
            <form class="chat-with-seller-form" id="chat-with-seller-form">
                <div>
                    <label for="chat-customer-name">${escapeHtml(t.name)}*</label>
                    <input name="chat-customer-name" id="chat-customer-name" type="text"/>
                </div>
                ${emailField}
                <div>
                    <label for="customer-chat">${escapeHtml(t.message)}*</label>
                    <textarea id="customer-chat-user-request" name="customer-chat" rows="${escapeHtml(settings.stChatTxtBoxRows)}" cols="50" placeholder="${escapeHtml(settings.stChatTxtBoxPlaceholder)}"></textarea>
                </div>
                <div class="honeypot-fields">
                    <input type="text" id="chatHoneypotNameFieldName" name="chat_honeypot_name_field_name" autocomplete="off" tabindex="-1" />
                    <input type="text" id="chatHoneypotValidFromFieldName" name="chat_honeypot_valid_from_field_name" autocomplete="off" tabindex="-1" />
                </div>
                <div id="customer-chat-success"></div>
                <div id="customer-chat-error"></div>
                <button type="submit" form="chat-with-seller-form" id="submit-customer-query" class="chat-submit-btn-custom-styling">
                    ${escapeHtml(t.submit)}
                </button>
            </form>
        </div>
    </div>`
}

async function CustomerChat() {
    // App proxy base URL (must match Shopify app proxy subpath prefix)
    const API_BASE_URL = '/a/dashboard';

    const app = document.getElementById('st-customer-chat-app');
    if (!app) return;

    const customerEmail = app.dataset.customerEmail || '';
    let settings = {};
    try {
        settings = JSON.parse(app.dataset.blockSettings || '{}');
    } catch (e) {
        console.error('customer-chat: invalid block settings', e);
    }

    const t = await loadCustomerChatMessages(app);
    applyChatStyles(settings);
    renderChat(app, settings, t, customerEmail);

    let honeypotData = null;
    const getHoneyPot = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/honeypot-data`)
            const { honeypot } = await res.json()
            honeypotData = honeypot

            const honeypotNameFieldEl = document.getElementById('chatHoneypotNameFieldName')
            const honeypotValidFromFieldEl = document.getElementById('chatHoneypotValidFromFieldName')

            if (honeypotNameFieldEl) {
                honeypotNameFieldEl.setAttribute('name', honeypot.nameFieldName)
            }
            if (honeypotValidFromFieldEl) {
                honeypotValidFromFieldEl.setAttribute('name', honeypot.validFromFieldName)
                honeypotValidFromFieldEl.value = honeypot.encryptedValidFrom
            }
        } catch (error) {
            console.error('customer-chat: failed to load honeypot data', error)
        }
    }
    getHoneyPot();

    const url = `${API_BASE_URL}/vendor/contact`
    let chatWithSellerBtn = document.getElementById('st-customer-chat-cta')
    let chatWithSellerContainer = document.getElementById('chat-with-seller-container')
    let closePopupBtn = document.getElementById('st-chat-with-seller-close')
    let chatWithSellerForm = document.getElementById('chat-with-seller-form')
    let userName = document.getElementById('chat-customer-name')
    let userRequest = document.getElementById('customer-chat-user-request')
    let customerEmailInput = document.getElementById('chat-customer-email')
    let successText = document.getElementById('customer-chat-success')
    let errorText = document.getElementById('customer-chat-error')
    let submitButton = document.getElementById('submit-customer-query')
    let productId = ShopifyAnalytics.meta.product && ShopifyAnalytics.meta.product.id;
    let variantId = ShopifyAnalytics.meta.product.variants[0]?.id;

    if (!productId) {
        const hiddenProductInput = document.querySelector('input[type="hidden"][name*="product-id"]');
        if (hiddenProductInput) {
            productId = hiddenProductInput.value;
        } else {
            console.log('Product ID not found in ShopifyAnalytics or hidden input');
        }
    }
    const getVariantID = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const variantParam = urlParams.get('variant');
        if (variantParam) {
            variantId = variantParam;
        } else {
            variantId = ShopifyAnalytics?.meta?.selectedVariantId;
        }
    }
    userRequest.value = null;
    userName.value = null;

    // Email verification (only when enabled in block settings)
    const verificationRequired = !!settings.stChatEmailVerificationRequired
    let otpSent = false
    let emailVerified = false
    let verifiedEmail = ''
    let otpCountdown = 0
    let otpCountdownInterval = null
    const verifyEmailBtn = document.getElementById('st-chat-verify-email-btn')
    const verifyCodeBtn = document.getElementById('st-chat-verify-code-btn')
    const codeInputs = Array.from(document.querySelectorAll('#st-chat-code-inputs .st-chat-code-input'))
    const codeHint = document.getElementById('st-chat-code-hint')

    const isEmailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')
    const getOtp = () => codeInputs.map(input => input.value).join('')

    const setCodeHint = (html, state) => {
        if (!codeHint) return
        codeHint.innerHTML = html
        codeHint.classList.remove('is-error', 'is-success')
        if (state) codeHint.classList.add(`is-${state}`)
    }

    const updateVerifyButtons = () => {
        if (!verifyEmailBtn) return
        verifyEmailBtn.textContent = emailVerified ? `✓ ${t.verified}` : (otpSent ? t.resendEmail : t.verifyEmail)
        verifyEmailBtn.classList.toggle('is-verified', emailVerified)
        verifyEmailBtn.disabled = emailVerified || (otpSent && otpCountdown > 0) || !isEmailValid(customerEmailInput.value.trim())
        verifyCodeBtn.hidden = !otpSent || emailVerified
        verifyCodeBtn.disabled = getOtp().length !== codeInputs.length
        submitButton.disabled = !emailVerified
    }

    const renderCountdown = () => {
        const m = Math.floor(otpCountdown / 60).toString().padStart(2, '0')
        const s = (otpCountdown % 60).toString().padStart(2, '0')
        setCodeHint(`${escapeHtml(t.resendIn)} <strong>${m}:${s}</strong>`)
    }

    const stopCountdown = () => {
        clearInterval(otpCountdownInterval)
        otpCountdownInterval = null
        otpCountdown = 0
    }

    const startCountdown = (seconds = 60) => {
        clearInterval(otpCountdownInterval)
        otpCountdown = seconds
        renderCountdown()
        updateVerifyButtons()
        otpCountdownInterval = setInterval(() => {
            otpCountdown--
            if (otpCountdown > 0) {
                renderCountdown()
            } else {
                stopCountdown()
                setCodeHint('')
            }
            updateVerifyButtons()
        }, 1000)
    }

    const enableCodeInputs = () => {
        codeInputs.forEach(input => {
            input.value = ''
            input.disabled = false
        })
        codeInputs[0]?.focus()
    }

    const resetVerification = () => {
        otpSent = false
        emailVerified = false
        verifiedEmail = ''
        stopCountdown()
        codeInputs.forEach(input => {
            input.value = ''
            input.disabled = true
        })
        setCodeHint(escapeHtml(t.codeHint))
        updateVerifyButtons()
    }

    const sendOtp = async () => {
        const email = customerEmailInput.value.trim()
        if (!isEmailValid(email)) {
            setCodeHint(escapeHtml(t.invalidEmail), 'error')
            return
        }
        verifyEmailBtn.disabled = true
        verifyEmailBtn.textContent = t.sending
        try {
            const res = await fetch(`${API_BASE_URL}/vendor/registration-otp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email, shop_domain: Shopify.shop })
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok && !data?.retry_after) {
                throw new Error(data?.message || t.codeSendFailed)
            }
            otpSent = true
            enableCodeInputs()
            startCountdown(res.ok ? 60 : data.retry_after)
        } catch (error) {
            console.error('customer-chat: failed to send OTP', error)
            setCodeHint(escapeHtml(error.message || t.codeSendFailed), 'error')
            updateVerifyButtons()
        }
    }

    const verifyOtp = async () => {
        const otp = getOtp()
        if (otp.length !== codeInputs.length) return
        const email = customerEmailInput.value.trim()
        verifyCodeBtn.disabled = true
        verifyCodeBtn.textContent = t.verifying
        try {
            const res = await fetch(`${API_BASE_URL}/vendor/registration-otp/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email, otp })
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                let msg = data?.message || t.invalidCode
                if (data?.attempts_remaining !== undefined) {
                    msg += ` (${data.attempts_remaining} ${data.attempts_remaining === 1 ? t.attemptRemaining : t.attemptsRemaining})`
                }
                throw new Error(msg)
            }
            emailVerified = true
            verifiedEmail = email
            stopCountdown()
            codeInputs.forEach(input => { input.disabled = true })
            setCodeHint(escapeHtml(t.emailVerified), 'success')
        } catch (error) {
            setCodeHint(escapeHtml(error.message || t.invalidCode), 'error')
        } finally {
            verifyCodeBtn.textContent = t.verify
            updateVerifyButtons()
        }
    }

    if (verificationRequired && verifyEmailBtn) {
        verifyEmailBtn.addEventListener('click', sendOtp)
        verifyCodeBtn.addEventListener('click', verifyOtp)
        customerEmailInput.addEventListener('input', () => {
            if (otpSent || emailVerified) resetVerification()
            else updateVerifyButtons()
        })
        updateVerifyButtons()

        codeInputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '').slice(-1)
                if (input.value && index < codeInputs.length - 1) codeInputs[index + 1].focus()
                updateVerifyButtons()
            })
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && index > 0) {
                    codeInputs[index - 1].value = ''
                    codeInputs[index - 1].focus()
                    updateVerifyButtons()
                } else if (e.key === 'Enter') {
                    e.preventDefault()
                    verifyOtp()
                }
            })
            input.addEventListener('paste', (e) => {
                const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, codeInputs.length)
                if (!digits) return
                e.preventDefault()
                codeInputs.forEach((codeInput, i) => { codeInput.value = digits[i] || '' })
                codeInputs[Math.min(digits.length, codeInputs.length) - 1].focus()
                updateVerifyButtons()
            })
        })
    }

    const submitForm = (e) => {
        e.preventDefault()
        successText.textContent = '';
        errorText.textContent = ''

        if(!userName.value || userName.value.length === 0 ||
           !customerEmailInput.value || customerEmailInput.value.length === 0 ||
           !userRequest.value || userRequest.value.length === 0) {
            errorText.textContent = t.fillFields
            return
        }

        if (verificationRequired && (!emailVerified || verifiedEmail !== customerEmailInput.value.trim())) {
            errorText.textContent = t.verifyEmailFirst
            return
        }

        var formData = new FormData()
        formData.append('shopify_domain', Shopify.shop);
        formData.append('channel_id',  productId);
        formData.append('name', userName.value);
        formData.append('message', userRequest.value);
        formData.append('email', customerEmailInput.value)
        formData.append('variant_id', variantId);
        formData.append('honeypot_enabled', true);
        if (verificationRequired) {
            formData.append('email_verification', true);
        }
        if (honeypotData) {
            formData.append(honeypotData.nameFieldName, '');
            formData.append(honeypotData.validFromFieldName, honeypotData.encryptedValidFrom);
        }

        submitButton.disabled = true;

        fetch(url, {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            successText.textContent = t.messageSent
            submitButton.disabled = false;
            setTimeout(() => {
                hideForm()
            }, 1000)
        })
        .catch(error => {
            errorText.textContent = t.submitFailed
            submitButton.disabled = false;
        });
    }

    const showForm = () => {
        chatWithSellerContainer.classList.remove('hide')
        chatWithSellerContainer.classList.add('show')
        chatWithSellerBtn.classList.add('hide')
    }

    const hideForm = () => {
        chatWithSellerContainer.classList.remove('show')
        chatWithSellerContainer.classList.add('hide')
        chatWithSellerBtn.classList.remove('hide')
        userRequest.value = null;
        successText.textContent = null;
        errorText.textContent = '';
        userName.value = null
    }
    if(chatWithSellerForm){
        chatWithSellerForm.addEventListener('submit', submitForm, false);
    }else{
       submitButton.removeAttribute('type')
       submitButton.removeAttribute('form')
       submitButton.addEventListener('click', submitForm, false);
    }

    closePopupBtn.addEventListener('click', hideForm)
    chatWithSellerBtn.addEventListener('click', showForm)
    const productForm = document.querySelectorAll('product-form form[method="post"][action="/cart/add"]');
    if (productForm) {
        productForm.forEach(form => {
            form.addEventListener('change', getVariantID);
        });
    }
}
CustomerChat()