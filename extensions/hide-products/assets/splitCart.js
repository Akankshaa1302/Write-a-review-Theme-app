var $STJQueryInstance = null
document.addEventListener('DOMContentLoaded', function() {
    if (!$STJQueryInstance) {
        $STJQueryInstance = jQuery.noConflict();
    }
    $STJQueryInstance( document ).ready(function( $ ) {
        var current_pagetype = meta.page.pageType;
        if (current_pagetype == "cart") {
            var ship_turtle_baseUrl = "https://api.shipturtle.com";
            var splitcart_font_family = $('#shipturtle_splitcart_css').data('splitcart_font_family');
            const searchParams = new URLSearchParams(window.location.search);
            var is_preview = searchParams.get('is_preview');
            
            var targetDiv = $('#st-cart-wrapper');
            var customCSSTargetEl = $('#st-custom-css');

            targetDiv.css("font-family",splitcart_font_family+' !important');
            $('#main-cart-footer').hide();
            showloader();
            
            $.getJSON(`/cart.js?ts=${Date.now()}`, function(cart) 
            {
                let product_data = cart;
                const shopifyCartVariantIds = [...getShopifyCartVariantIds(product_data, $)]

                updateSessionItemsAccordingToShopifyCartData(product_data, $)
                
                // Add items back to Shopify cart if available in session but not in Shopify cart data
                const productsInSessionButNotInShopifyCart = getItemsInSessionButNotInShopifyCart(shopifyCartVariantIds)
                if (productsInSessionButNotInShopifyCart.length > 0) {
                    const newlyAddedProductData = addItemsBackToShopifyCart(productsInSessionButNotInShopifyCart, $)
                    product_data.items = [...newlyAddedProductData.items, ...product_data.items]
                }

                // Call Shipturtle API with updated product_data

                // currency_symbol is set in st-cart-snippet.liquid file. We can not set it in this file because liquid is the only file that can give us.
                // access to cart.currency.symbol.
                $.ajax({
                    url: ship_turtle_baseUrl +`/st-cart?locale=${Shopify.locale}`,
                    type: "POST",
                    dataType: 'json',
                    async: false,
                    data: {'product_data': product_data,'currency_symbol': window.currency_symbol, 'shop_domain': Shopify.shop,
                    'is_preview': is_preview || false},
                    success: function (response) {
                            targetDiv.append(response.html);
                            removeloader()
                            customCSSTargetEl.html(response.css)
                            if (document.getElementById('hide-order-summary-card').value === 'true') {
                                $('#order-summary-details-container').hide()
                                $('#vendor-wise-cart-item-container').addClass('col-sm-12')
                            }
                            if (document.getElementById('hide-vendor-wise-checkout-btns').value === 'true') {
                                $('.st-vendor-wise-checkout-btn').hide()
                            }
                    }
                });
            });
        } else {
            // If there is a mismatch b/n the shopify cart items and session storage items
            // while the user is on a page other than '/cart', update the shopify cart 
            // and show updated cart count by reloading the page.
            IfMismatchUpdateShopifyCart().then((newlyAddedProductData) => {
                if(newlyAddedProductData && newlyAddedProductData.items.length > 0) {
                    window.location.reload()
                }
            }).catch(error => {
                console.error('Error *** : ', error)
            })
        }

        function IfMismatchUpdateShopifyCart () {
            return new Promise((resolve, reject) => {
                $.getJSON('/cart.js', function(cart) 
                {
                    const product_data = cart;
                    const shopifyCartVariantIds = [...getShopifyCartVariantIds(product_data, $)]
                    let newlyAddedProductData = null
                    const productsInSessionButNotInShopifyCart = getItemsInSessionButNotInShopifyCart(shopifyCartVariantIds)

                    if (productsInSessionButNotInShopifyCart.length > 0) {
                        newlyAddedProductData = addItemsBackToShopifyCart(productsInSessionButNotInShopifyCart, $)
                    }
                    resolve(newlyAddedProductData)
                })
            })
        }

        function showloader() {
            var loader = `
            <div class="st_loader-container">
                <div class="st_loader">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
            </div>`;
            
            var targetDiv = $('#st-cart-wrapper');
            targetDiv.append(loader);
        }

        function removeloader() {
            $('.st_loader-container').hide()
            $('.st-cart-page-container').show()
            stCalculateTotalPrices();
        }    
    });
    
});

/* 
* ? Why do we need the below logic?
* When the user clicks the 'Checkout' button, we assume a successful checkout and remove the relevant cart data from session storage. 
* However, if the user navigates to the checkout page but does not complete the checkout process and returns to the cart page, 
* we must update the session storage to ensure it remains consistent with Shopify's cart. 
*
* Additionally, when the 'Buy Now' button is clicked, Shopify's cart is replaced with only the selected product. 
* Since our vendor-specific 'Checkout' button follows the same approach as 'Buy Now,' we need to ensure synchronization between 
* the session storage cart and the Shopify cart. This means adding any products found in session storage but missing from Shopify's cart(because Shopify replaces the cart data with the to be checked out products when the vendor-wise 'Checkout' button is clicked), 
* and adding any products found in Shopify cart but missing in the session storage(because we remove all the to-be checked out products from session storage when the user clicked the vendor-wise 'Checkout' button).
*/
window.addEventListener('pageshow', function(event) {
    if (event.persisted && ShopifyAnalytics.meta.page.pageType === 'cart') {
        stCalculateTotalPrices();
        $STJQueryInstance.getJSON('/cart.js', function(cart) {
            let product_data = cart;
            const shopifyCartVariantIds = [...getShopifyCartVariantIds(product_data, $STJQueryInstance)]
            updateSessionItemsAccordingToShopifyCartData(product_data, $STJQueryInstance)
            let productsInSessionButNotInShopifyCart = getItemsInSessionButNotInShopifyCart(shopifyCartVariantIds)
            if (productsInSessionButNotInShopifyCart.length > 0) {
                addItemsBackToShopifyCart(productsInSessionButNotInShopifyCart, $STJQueryInstance)
            }
            
            window.location.reload();
        })
    }
});

/* Icrement/Decrement Quantity, Check Out, Remove Item etc Functionality Logic */

let timeoutId = null;
var sessionStorageQuantity;
function stCalculateTotalPrices() {
        var totalProductsCount = 0;
        var totalAmountDue = 0;
        $STJQueryInstance(".st_main_cart").each(function() {
            // START : vendor wise products calculation 
            let totalVendorWisePrice = 0;
            let vendorWiseProductsCount = 0
            let vendorname = $STJQueryInstance(this).data('vendorname');
            $STJQueryInstance(this).find('.st_split_cart').each(function() {
                var productprice = $STJQueryInstance(this).find('.st_prd_price').text();
                var price = productprice.replace(window.currency_symbol, "");
                totalVendorWisePrice += parseFloat(price);
                vendorWiseProductsCount += 1
                totalProductsCount += 1
            });
            
            totalAmountDue += totalVendorWisePrice;
            var selector = $STJQueryInstance.escapeSelector(vendorname);
            $STJQueryInstance(this).find('#st_prd_totalprice_'+selector).html(window.currency_symbol + totalVendorWisePrice.toFixed(2));
            $STJQueryInstance('#st_vendor_wise_total_products_count_' + selector).html(+ vendorWiseProductsCount)
            $STJQueryInstance('.st_order_summerdetails').find('.st_ordersummery_prd_price_'+selector).html(window.currency_symbol + totalVendorWisePrice.toFixed(2));
        
        })
        $STJQueryInstance('.st-total-products').html(totalProductsCount);
        $STJQueryInstance('.st-total-due-all-products').html(window.currency_symbol + totalAmountDue.toFixed(2))
}
function stIncrDecrQuantity(operation, variant_id, currency_symbol, key, vendorName){   
    let quantity_text
    let finalquantity

    if(operation == 'Plus'){
        quantity_text = parseInt($STJQueryInstance('.st_quantity_text_'+variant_id).val());
        $STJQueryInstance('.st_quantity_text_'+variant_id).val(quantity_text+1);
        finalquantity = quantity_text+1;
    } else if(operation == 'Minus'){
        quantity_text = parseInt($STJQueryInstance('.st_quantity_text_'+variant_id).val());
        $STJQueryInstance('.st_quantity_text_'+variant_id).val(quantity_text-1);
        finalquantity = quantity_text-1;
    }

    if (finalquantity === 0) {
        stRemoveProductsFromCart(variant_id, vendorName)
        return
    }
    if (timeoutId) {
        clearTimeout(timeoutId)
    }

    var selector = $STJQueryInstance.escapeSelector(key);
    timeoutId = setTimeout(() => {  
        $STJQueryInstance.ajax({
        type: "POST",
        url: '/cart/change.js',
        data: {
            'id': variant_id,
            'quantity': finalquantity
            },
        dataType: 'json',
        beforeSend: function () {
            $STJQueryInstance('#st_prd_price_'+variant_id).hide()
            $STJQueryInstance('#st_prd_totalprice_'+selector).hide()
            $STJQueryInstance('#cart_elements_'+variant_id).show()
            $STJQueryInstance('#cart_elements_'+selector).show()
            $STJQueryInstance('#error_message_'+variant_id).hide()
        },
        success: function(data, textstatus) {
            const updatedItem = data.items.filter(item => item.id == variant_id)
            const updatedLinePrice = updatedItem[0].original_line_price / 100
            $STJQueryInstance('#st_prd_price_'+variant_id).html(currency_symbol + updatedLinePrice)
            stCalculateTotalPrices()
            let vendorSessionStorageValue = JSON.parse(sessionStorage.getItem('shipturtle_' + vendorName))
            const indexToUpdate = vendorSessionStorageValue.findIndex(item => item.variantId === Number(variant_id))
            vendorSessionStorageValue[indexToUpdate].quantity = finalquantity
            sessionStorage.setItem('shipturtle_' + vendorName, JSON.stringify(vendorSessionStorageValue))
            timeoutId = null
        },
        complete: function (xhr, status) {
            $STJQueryInstance('#st_prd_price_'+variant_id).show()
            $STJQueryInstance('#st_prd_totalprice_'+selector).show()
            $STJQueryInstance('#cart_elements_'+variant_id).hide()
            $STJQueryInstance('#cart_elements_'+selector).hide()

            if (status === 'error') {
                $STJQueryInstance('#error_message_'+variant_id).html(xhr.responseJSON.message)
                $STJQueryInstance('#error_message_'+variant_id).show()
            }
            timeoutId = null
        }
        });
    }, 500);
}

function stRemoveProductsFromCart(variant_id, vendorName){
    const removeBtn = $STJQueryInstance('#remove_item_btn_' + variant_id)
    const removeCartItemBtnText = $STJQueryInstance('#remove_cart_item_text_' + variant_id)
    const removeCartItemLoader = $STJQueryInstance('#remove_cart_item_loader_'+variant_id)
    $STJQueryInstance.ajax({
        type: "POST",
        url: '/cart/change.js',
        data: {
            'id': variant_id,
            'quantity': 0
        },
        dataType: 'json',
        beforeSend: function() {
            removeBtn.prop('disabled', true)
            removeCartItemBtnText.hide()
            removeCartItemLoader.show()
        },
        success: function() {
            let vendorSessionStorageValue = JSON.parse(sessionStorage.getItem('shipturtle_' + vendorName))
            vendorSessionStorageValue = vendorSessionStorageValue.filter(item => item.variantId !== Number(variant_id))

            sessionStorage.setItem('shipturtle_' + vendorName, JSON.stringify(vendorSessionStorageValue))

            if (JSON.parse(sessionStorage.getItem('shipturtle_' + vendorName)).length === 0) {
                sessionStorage.removeItem('shipturtle_' + vendorName)
            }
        },
        complete: function(data, textstatus) {
            removeBtn.prop('disabled', false)
            removeCartItemLoader.hide()
            location.reload(true);
        }
    });
}

function stVendorWiseCheckout(key, vendorName){
    var createlink = "";
    var selector = $STJQueryInstance.escapeSelector(key);
    $STJQueryInstance('.st_vendorprdwise_'+selector).each(function() {
        var entered_qty = $STJQueryInstance(this).val();
        var product_id = $STJQueryInstance(this).data('product_id');
        createlink +=product_id+':'+entered_qty+',';
    });

    var finalvendorwisecheckoutlink = createlink.slice(0, -1);
    let vendorSessionStorageValue = sessionStorage.getItem('shipturtle_' + vendorName)
    
    if (vendorSessionStorageValue) {
        sessionStorage.removeItem('shipturtle_' + vendorName)
    }
    document.location.href = '/cart/'+finalvendorwisecheckoutlink+'?traffic_source=buy_now';
}

function handleFormSubmit(event, formElement) {
    event.preventDefault();
   for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('shipturtle_')) {
            sessionStorage.removeItem(key);
            i--;
        }
    }

    setTimeout(() => {
      formElement.submit();
    }, 0);

    return false;
  }
/*
* The vendor-wise checkout button's implementation is exactly the same as the the 'Buy Now' button of Shopify. When that button
* is clicked all the cart items of Shopify will be replaced with that single product data which was moved to checkout page by the
* 'Buy Now' button causing cart items to be missing. To avoid this we are using session storage to maintain shopify cart.
* Whenever the user visits the checkout page and comes back to the cart page, we will check if there are items in the session storage
* but not in the shopify cart data. If there are, we will use the add.js ajax api of Shopify in order to add them back. 
* 
* On the other hand, we are constantly updating our session storage so that it is consistent with the Shopify's cart data.
* For example, whenever a user goes to product page and add items to the cart, Shopify will update it's cart. When the user visits 
* the cart page, we will fetch the shopify cart data using the cart.js ajax call, and we will update our session data accordingly.
* There are different scenarios which are covered(we've tried to make the code self explanatory).
*
**/
function updateSessionItemsAccordingToShopifyCartData(product_data, $) {
    $.each(product_data.items, function () {
        let vendorItemsInSession = sessionStorage.getItem('shipturtle_' + this.vendor)
        if (vendorItemsInSession) {
            vendorItemsInSession = JSON.parse(vendorItemsInSession)
            const existingVendorItem = vendorItemsInSession.find(item => item.variantId === this.variant_id)
            if (existingVendorItem) {
                if (existingVendorItem.quantity != this.quantity) {
                    const indexToUpdate = vendorItemsInSession.findIndex(item => item.variantId === this.variant_id)
                    vendorItemsInSession[indexToUpdate].quantity = this.quantity
                    sessionStorage.setItem('shipturtle_' + this.vendor, JSON.stringify(vendorItemsInSession))
                }
            } else {
                vendorItemsInSession.push({
                    variantId: this.variant_id,
                    quantity: this.quantity
                })
                sessionStorage.setItem('shipturtle_' + this.vendor, JSON.stringify(vendorItemsInSession))

            }
        } else {
            // 'New vendor with new product added' case
            const payload = [{
                variantId: this.variant_id,
                quantity: this.quantity
            }]
            sessionStorage.setItem('shipturtle_' + this.vendor, JSON.stringify(payload))
        }
    })
}
function getShopifyCartVariantIds(product_data, $) {
    const shopifyCartVariantIds = []
    $.each(product_data.items, function () {
        shopifyCartVariantIds.push(this.variant_id)
    })

    return shopifyCartVariantIds
}
function getItemsInSessionButNotInShopifyCart(shopifyCartVariantIds) {

    const productsInSessionButNotInShopifyCart = []
    const sessionStorageKeys = Object.keys(sessionStorage).reverse() 
    sessionStorageKeys.forEach((key) => {
        if(key.indexOf('shipturtle_') > -1) {
            const value = sessionStorage.getItem(key)
            const vendorProductsInfoArray = JSON.parse(value)
            if (Array.isArray(vendorProductsInfoArray)) {
                vendorProductsInfoArray.forEach((productInfo) => {
                    const variantId = productInfo.variantId
                    const quantity = productInfo.quantity

                    if (!isAlreadyAddedToShopifyCart(shopifyCartVariantIds, variantId)) {
                        productsInSessionButNotInShopifyCart.push({id: variantId, quantity})
                    }
                })
            }
        }
    })
    return productsInSessionButNotInShopifyCart;
}

function addItemsBackToShopifyCart(productsInSessionButNotInShopifyCart, $) {
    let newlyAddedProductData = { items: [] }
    $.ajax({
        url: '/cart/add.js',
        type: 'POST',
        data: {'items': productsInSessionButNotInShopifyCart},
        async: false,
        dataType: 'json',
        success: function (data) { 
            newlyAddedProductData.items = [
                ...data.items
            ]
        }
    })
    return newlyAddedProductData
}

function isAlreadyAddedToShopifyCart(shopifyCartVariantIds, variantId) {
    return shopifyCartVariantIds.indexOf(Number(variantId)) !== -1
}
function isJSON(value) {
    try {
        JSON.parse(value);
        return true;
    } catch (error) {
        return false; // If an error occurs, it's not a JSON object
    }
}