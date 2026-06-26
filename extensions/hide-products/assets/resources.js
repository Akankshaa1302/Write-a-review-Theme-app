window.ST_Resources = {
    _assetBase: (() => {
        const src = document.currentScript?.src || '';
        return src.substring(0, src.lastIndexOf('/') + 1);
    })(),
    
    loadScript: function(dep) {
        return new Promise((resolve, reject) => {
            const { src, global } = dep;

            const checkGlobal = () => {
                if (global) {
                    const parts = global.split('.');
                    let current = window;
                    for (const part of parts) {
                        current = current?.[part];
                        if (!current) return false;
                    }
                    return true;
                }
                return !!document.querySelector(`script[src="${src}"]`);
            };

            if (checkGlobal()) {
                resolve(src);
                return;
            }

            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                const interval = setInterval(() => {
                    if (checkGlobal()) {
                        clearInterval(interval);
                        resolve(src);
                    }
                }, 100);
                return;
            }

            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = () => {
                if (checkGlobal()) {
                    resolve(src);
                } else {
                    const interval = setInterval(() => {
                        if (checkGlobal()) {
                            clearInterval(interval);
                            resolve(src);
                        }
                    }, 50);
                }
            };
            s.onerror = () => reject({ message: `Failed to load ${src}`, src: src });
            document.head.appendChild(s);
        });
    },

    loadDependencies: function(callback, extraDeps = [], featureName = 'Shopify App Feature') {
        
        const shopifyAssetCDNBase = this._assetBase;
        const coreDeps = [
            { src: shopifyAssetCDNBase ? `${shopifyAssetCDNBase}vuejs-min.js` : 'https://unpkg.com/vue@3.5.1/dist/vue.global.js', global: 'Vue' },
            { src: shopifyAssetCDNBase ? `${shopifyAssetCDNBase}primevue.min.js` : 'https://unpkg.com/primevue/umd/primevue.min.js', global: 'PrimeVue' },
            { src: shopifyAssetCDNBase ? `${shopifyAssetCDNBase}vue-i18n.min.js` : 'https://unpkg.com/vue-i18n@9/dist/vue-i18n.global.prod.js', global: 'VueI18n' },
            { src: shopifyAssetCDNBase ? `${shopifyAssetCDNBase}aura.min.js` : 'https://unpkg.com/@primevue/themes/umd/aura.min.js', global: 'PrimeVue.Themes.Aura' }
        ];

        const allDeps = [...coreDeps, ...extraDeps];

        Promise.all(allDeps.map(dep => this.loadScript(dep)))
            .then(() => {
                const finalCheck = setInterval(() => {
                    const allLoaded = allDeps.every(dep => {
                        const { global } = dep;
                        if (!global) return true;
                        
                        const parts = global.split('.');
                        let current = window;
                        for (const part of parts) {
                            current = current?.[part];
                            if (!current) return false;
                        }
                        return true;
                    });

                    if (allLoaded) {
                        clearInterval(finalCheck);
                        callback();
                    }
                }, 50);
            })
            .catch(err => {
                console.error('Dependency load error:', err);

                const failedScript = err.src || err.message || 'Unknown script';

                this.notifyDeveloper({
                    feature: featureName,
                    title: 'Shopify Theme App Dependency Failed',
                    fields: { 'Failed Script': `<${failedScript}>` }
                });
            });
    },

    /**
     *
     * @param {Object}  opts
     * @param {string}  opts.feature  
     * @param {string}  opts.title   
     * @param {Object} [opts.fields]
     */
    notifyDeveloper: function({ feature, title, fields = {} } = {}) {
        try {
            const baseFields = {
                'Feature': feature,
                'Shop': window.Shopify?.shop,
                ...fields,
                'Time': new Date().toISOString(),
                'Network': navigator.connection?.effectiveType
            };

            const lines = [
                `🚨 *${title || 'Theme App Alert'}*`,
                ...Object.entries(baseFields)
                    .filter(([, v]) => v !== undefined && v !== null && v !== '')
                    .map(([k, v]) => `*${k}:* ${v}`)
            ];

            fetch('https://api-v2.shipturtle.com/api/v1/notify-developer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: lines.join('\n'),
                    via: 'slack',
                    channel: 'shopify-theme-app-dependency-alerts'
                })
            }).catch(e => console.error('Error sending slack notification:', e));
        } catch (e) {
            console.error('notifyDeveloper failed:', e);
        }
    },

};
