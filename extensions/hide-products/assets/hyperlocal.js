
document.addEventListener('DOMContentLoaded', function () {
    const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    };
    
    const setCookie = (name, value, days) => {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = `${name}=${value}; expires=${expires}; path=/`;
    };
    
    const showPopup = () => {

        const zipPopup = document.getElementById('zip-popup')

        zipPopup.style.display = 'block'
        const currentZip = getCookie('visitor_zip') || 'Not set';
        
        const visitorZipCode = document.getElementById('visitor-zip-code')
        visitorZipCode.textContent = currentZip

        document.getElementById('zip-submit').addEventListener('click', () => {
            const zip = document.getElementById('zip-input').value;
            if (zip.trim() !== '') {
                setCookie('visitor_zip', zip, 7);
                if (window.location.pathname !== '/pages/availability') {
                    if (meta.page.pageType === 'collection' || meta.page.pageType === 'searchresults') {
                        const url = new URL(window.location.href);
                        url.searchParams.set(window.filterParamValue, zip); // Update the parameter
                        window.history.pushState({}, '', url); // Update URL without reloading
                        window.location.reload()
                    } else {
                        window.location.reload();
                    }
                }
                else {
                    window.location.href = '/';
                }
            }
            else {
                // Do nothing
            }
        });
    
        zipPopup.querySelector('#close-popup').addEventListener('click', () => {
            const currentZip = getCookie('visitor_zip')
            if (currentZip) {
                zipPopup.style.display = 'none'
            }
        });

    };
    
    const setupChangeButton = () => {
        const changeButton = document.getElementById('zipcode-change-button')
        changeButton.addEventListener('click', () => {
            sessionStorage.removeItem('redirected');
            showPopup();
        });
    };
    
    const visitorZip = getCookie('visitor_zip');
    const currentPath = window.location.pathname;
    
    // Prevent redirect logic from running on /pages/availability
    if (currentPath === '/pages/availability') {
        setupChangeButton();
        return; // Exit to avoid further redirection checks
    }
    if (!visitorZip) {
        showPopup();
        // fetch('https://ipapi.co/json/')
        //     .then(response => response.json())
        //     .then(data => {
        //         if (data.postal) {
        //             setCookie('visitor_zip', data.postal, 7);
        //             if (meta.page.pageType === 'collection' || meta.page.pageType === 'searchresults') {
        //                 const urlParams = new URLSearchParams(window.location.search);
        //                 const searchValue = urlParams.get(window.filterParamValue);

        //                 if (searchValue && searchValue !== data.postal) {
        //                     const url = new URL(window.location.href);

        //                     url.searchParams.set(window.filterParamValue, data.postal); // Update the parameter
        //                     window.history.pushState({}, '', url); // Update URL without reloading
        //                     window.location.reload()
        //                 }
        //             } else {
        //                 window.location.reload();
        //             }

        //         } else {
                    
        //         }
        //     })
        //     .catch(() => showPopup());
    }
    
    setupChangeButton();
    
    const changePinCodeLink = document.getElementById('change-pin-code');
    if (changePinCodeLink) {
        changePinCodeLink.addEventListener('click', (event) => {
            event.preventDefault();
            showPopup();
        });
    }
});

window.onload = function () {
    if ((meta.page.pageType === 'collection' || meta.page.pageType === 'searchresults') && window.location.search.indexOf(window.filterParamValue) === -1) {
        const visitorZip = document.cookie.split('; ').find(row => row.startsWith('visitor_zip='));
        const zipValue = visitorZip ? visitorZip.split('=')[1] : '';

        if (!zipValue) return
        if (window.location.search) {
            window.location.href += `&${window.filterParamValue}=${zipValue}`;
        } else {
            window.location.href += `?${window.filterParamValue}=${zipValue}`
        }
    }

}

document.addEventListener('DOMContentLoaded', () => {

    if (meta.page.pageType === 'product') {
        const main = document.querySelector('main')

        const visitorZip = document.cookie.split('; ').find(row => row.startsWith('visitor_zip='));
        const zipValue = visitorZip ? visitorZip.split('=')[1] : '';

        if (zipValue) {
            if (!window.productMetafields.zipCodes || window.productMetafields.zipCodes.length === 0) {
                return
            }
            if (!window.productMetafields.zipCodes.includes(zipValue)) {
                main.innerHTML = ''
                const div = document.createElement('div')
                div.style.textAlign = 'center'
                div.style.margin = "3rem 0"
                div.textContent = 'This product is not available in your area.'
                main.appendChild(div);
            }
        } else {
            main.innerHTML = ''
                const div = document.createElement('div')
                div.style.textAlign = 'center'
                div.style.margin = "3rem 0"
                div.textContent = 'Please enter your ZIP code to view this product.'
                main.appendChild(div);
        }
    }
})
