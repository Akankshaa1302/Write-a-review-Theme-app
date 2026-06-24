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
    root.setProperty('--st-chat-cta-bg', settings.stChatWithSellerBtnBgColor)
    root.setProperty('--st-chat-cta-color', settings.stChatWithSellerBtnTxtColor)
    root.setProperty('--st-chat-cta-min-height', settings.stChatBtnHeight + 'px')
    root.setProperty('--st-chat-cta-font-size', settings.stChatCtaFontSize + 'px')
    root.setProperty('--st-chat-popup-color', settings.stPopupTxtColor)
    root.setProperty('--st-chat-font-size', settings.stChatFontSize + 'px')
    root.setProperty('--st-chat-submit-color', settings.stChatSubmitBtnTxtColor)
    root.setProperty('--st-chat-submit-bg', settings.stChatSubmitBtnBgColor)
    root.setProperty('--st-chat-submit-font-size', settings.stChatSubmitBtnFontSize + 'px')
}

function renderChat(app, settings, t, customerEmail) {
    const ctaText = settings.stChatWithSellerBtnTxt === 'Chat With Seller' ? t.chatWithSeller : settings.stChatWithSellerBtnTxt
    const headerText = settings.stChatHeaderText === 'Chat With Seller' ? t.chatWithSeller : settings.stChatHeaderText

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
                <div>
                    <label for="chat-customer-email">${escapeHtml(t.email)}*</label>
                    <input name="chat-customer-email" id="chat-customer-email" type="email" value="${escapeHtml(customerEmail)}"/>
                </div>
                <div>
                    <label for="customer-chat">${escapeHtml(t.message)}*</label>
                    <textarea id="customer-chat-user-request" name="customer-chat" rows="${escapeHtml(settings.stChatTxtBoxRows)}" cols="50" placeholder="${escapeHtml(settings.stChatTxtBoxPlaceholder)}"></textarea>
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

        var formData = new FormData()
        formData.append('shopify_domain', Shopify.shop);
        formData.append('channel_id',  productId);
        formData.append('name', userName.value);
        formData.append('message', userRequest.value);
        formData.append('email', customerEmailInput.value)
        formData.append('variant_id', variantId);

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