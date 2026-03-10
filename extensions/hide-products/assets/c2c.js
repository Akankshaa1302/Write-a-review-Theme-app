function createHiddenInputElement(name, id = null) {
    const inputElement = document.createElement('input');
    inputElement.setAttribute('name', name);
    inputElement.setAttribute('type', 'hidden');
    if (id) {
        inputElement.setAttribute('id', id);
    }
    inputElement.value = '/a/dashboard';

    return inputElement;
}

window.onload = function () {
    const isCustomerLoggedIn = ShopifyAnalytics.meta.page.customerId;

    if (isCustomerLoggedIn) return

    const isNewCustomerAccountPage = !window.customerAccountLoginURL.includes('/account/login');


    // 1. If client is using anchor tag(s)
    const dashboardLinkSelector = `a[href='https://${Shopify.shop}/a/dashboard'], a[href='https://${window.location.host}/a/dashboard']`;
    const dashboardLinks = document.querySelectorAll(dashboardLinkSelector);
    
    if (dashboardLinks.length) {
        dashboardLinks.forEach(link => {
            
            link.removeAttribute('onclick');

            // Redirection will be handled by our server if the user is new customer account page, therefore no need to manage it via local storage.
            if (isNewCustomerAccountPage) {
                link.href = `${link.href}?new_customer_account_page=true`;
            } else {
                link.addEventListener('click', () => {
                    localStorage.setItem('c2c_access_attempt', true);
                });
            }
        });
    }

    // 2. If the client is using button with an id instead of link
    const becomeASellerButton = document.getElementById('st-become-a-seller-btn')
    if (becomeASellerButton && !isNewCustomerAccountPage)
    {   
        becomeASellerButton.addEventListener('click', function () {
            localStorage.setItem('c2c_access_attempt', true);
        });
    }


    // Inject input fields that are used by shopify to redirect the user to the C2C dashboard
    if (!isNewCustomerAccountPage) {
        var selector = '#create_customer, #customer_login, #captcha_form';
        var signForm = document.querySelector(selector);
        if (signForm) {
            // Redirect the user to the c2c dashboard if he had attempted to access but 
            // got redirected to login page b/c he was not logged in. 
            if (localStorage.getItem('c2c_access_attempt')) {
                const returnToInputElement = createHiddenInputElement('return_to')
                const checkoutURLInputElement = createHiddenInputElement('checkout_url', 'checkout_url')

                signForm.appendChild(returnToInputElement);
                signForm.appendChild(checkoutURLInputElement);
            }
        }
    }
};