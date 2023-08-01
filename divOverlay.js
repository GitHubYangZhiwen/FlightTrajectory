// divOverlay.ts 类
const supportClass = ['esri.layers.FeatureLayer', 'esri.layers.GraphicsLayer'];
const getGeometryCenter = (geometry) => {
    if (!geometry) {
        window.console.log(new Error('map:getGeometryCenter:几何对象为空'));
        return null
    }
    const { type } = geometry;
    // 获取图形中心点
    let center = null;
    switch (type) {
        case 'point':
            center = geometry
            break;
        case 'polyline':
            center = geometry.extent.center;
            break;
        case 'polygon':
            // center = geometry.centroid;
            center = geometry.extent.center;
            break;
        case 'extent':
            center = geometry.center;
            break;
        default:
            break;
    }
    return center;
}
const setClass = (el, name) => {
    if (!el.className['baseVal']) {
        el.className = name;
    } else {
        // in case of SVG element
        el.className['baseVal'] = name;
    }
};
const getClass = (el) => {
    if (el['correspondingElement']) {
        el = el['correspondingElement'];
    }
    return el.className['baseVal'] === undefined ? el.className : el.className['baseVal'];
};
const hasClass = (el, name) => {
    if (el.classList !== undefined) {
        return el.classList.contains(name);
    }
    const className = getClass(el);
    return className.length > 0 && new RegExp('(^|\\s)' + name + '(\\s|$)').test(className);
};
function splitWords(str) {
    return str.trim().split(/\s+/);
}
const addClass = (el, name) => {
    if (el.classList !== undefined) {
        const classes = splitWords(name);
        for (let i = 0, len = classes.length; i < len; i++) {
            el.classList.add(classes[i]);
        }
    } else if (!hasClass(el, name)) {
        const className = getClass(el);
        setClass(el, (className ? className + ' ' : '') + name);
    }
};

class DivOverlay {
    declaredClass = 'divoverlay';
    uiKey = 'div-overlay';
    map;
    mapView;
    source;
    options = {};
    container;
    data = [];
    domNodes = [];
    displayField = 'name';
    currentAlignmentr = 'top-center';
    _pointerOffsetInPx = 'top-center';
    hasArrow;

    constructor(options) {
        this.map = options.map;
        this.mapView = options.mapView;
        this.source = options.source || [];
        this.domNodes = {};
        this.displayField = options.displayField || 'name';
        this.hasArrow = options.hasOwnProperty('hasArrow') ? options.hasArrow : true;
        this._pointerOffsetInPx = (options.offset !== undefined) ? options.offset : 2;
        this.currentAlignment = options.alignment || 'top-center';
    }

    addTo() {
        this.renderer();
        if (supportClass.indexOf(this.source?.declaredClass) > -1) {
            this.source.on('layerview-destroy', () => {
                this.destroy();
            });
        }
    }

    renderer() {
        if (!Array.isArray(this.source) && supportClass.indexOf(this.source?.declaredClass) < 0) {
            window.console.log(new Error('数据源类型不对'));
        }
        this.createContainer();
        this.update();
        this.mapView.watch(['size', 'padding', 'extent'], () => {
            this.update();
        });
        if (!Array.isArray(this.source)) {
            this.source.on('draw-complete', () => {
                this.update();
            });
        }
    }

    update() {
        if (!Array.isArray(this.source) && this.source?.declaredClass === 'esri.layers.FeatureLayer') {
            this.queryDataFromFeatureLayer(this.source);
        }
        if (!Array.isArray(this.source) && this.source?.declaredClass === 'esri.layers.GraphicsLayer') {
            this.queryDataFromGraphicsLayer(this.source);
        }
        if (Array.isArray(this.source)) {
            this.reposition(this.source);
        }
    }

    createContainer() {
        this.container = document.createElement('div');
        addClass(this.container, this.uiKey);
        addClass(this.container, 'esri-divoverlay-container');
        this.container.id = this.uiKey;
        this.mapView.ui.add(this.container, {
            key: this.uiKey,
            position: "manual",
        })
    }

    createDivDom(content, id) {
        const container = document.createElement('div');
        addClass(container, 'esri-divoverlay');
        container.style.position = 'fixed';

        // 内容容器
        const wrapper = document.createElement('div');
        addClass(wrapper, 'esri-divoverlay-content-wrapper');
        const contentDom = document.createElement('div');
        addClass(contentDom, 'esri-divoverlay-content');
        wrapper.append(contentDom);
        container.append(wrapper);

        // 箭头标注
        if (this.hasArrow) {
            const tipContainer = document.createElement('div');
            addClass(tipContainer, 'esri-divoverlay-tip-container');
            addClass(tipContainer, `esri-divoverlay-tip-container-${this.currentAlignment}`);
            const tip = document.createElement('div');
            addClass(tip, 'esri-divoverlay-tip');
            addClass(tip, `esri-divoverlay-tip-${this.currentAlignment}`);
            tipContainer.append(tip);
            container.append(tipContainer);
        }

        // 关闭按钮
        const closeBtn = document.createElement('a');
        addClass(closeBtn, 'esri-divoverlay-close-button');
        closeBtn.innerText = '×';
        closeBtn.setAttribute('id', id);
        closeBtn.addEventListener('click', this._onCloseButtonClick.bind(this), false);
        container.append(closeBtn);

        const close = function () {
            closeBtn.click();
        }

        contentDom.innerText = content;
        return { container, close };
    }

    getContent(graphic, field) {
        const { attributes } = graphic;
        const content = attributes?.hasOwnProperty(field) ? attributes[field] : '';
        return content;
    }
    reposition(data) {
        this.data = data;
        const ids = [];
        data?.forEach(graphic => {
            if (graphic.declaredClass !== 'esri.Graphic') return null;
            const { geometry, visible, attributes } = graphic;
            const uid = attributes?.id.toString() || '';
            ids.push(uid);
            if (!visible) return null;
            if (geometry === undefined || geometry === null) return null;

            let target = this.domNodes[uid] || null;
            if (!target) {
                const { container, close } = this.createDivDom(this.getContent(graphic, this.displayField), uid);
                this?.container?.append(container);
                target = { container, close, attributes };
                this.domNodes[uid] = target;
            } else {
                const content = this.getContent(graphic, this.displayField);
                this.updateContent(target.container, content);
            }
            // 获取图形中心点
            const center = getGeometryCenter(geometry);
            if (!center) return null;
            this._positionContainer(target.container, center);
        });
        Object.keys(this.domNodes).forEach(key => {
            if (ids.indexOf(key) < 0) {
                this.domNodes[key]?.container?.remove();
                delete this.domNodes[key];
            }
        });
    }
    updateContent(container, content) {
        const target = container?.querySelector('.esri-divoverlay-content');
        if (target && target.innerHTML !== content) {
            target.innerHTML = content;
        }
    }

    _positionContainer = (container, center) => {
        let screenPoint = this.mapView.toScreen(center);
        const { width, height } = container?.getBoundingClientRect();
        screenPoint = this._calculatePositionStyle(screenPoint, width, height);
        if (!screenPoint) return;

        for (let key in screenPoint) {

            if (screenPoint[key] != 'auto') {
                container.style[key] = screenPoint[key];
            }
        }
        // container.style.left = screenPoint.left;
        // container.style.bottom = screenPoint.bottom;
        // container.style.right = screenPoint.right;
    }

    _calculatePositionStyle = (screenPoint, width, height) => {
        if (this.mapView && screenPoint && width && height) {
            const values = this._calculateFullWidth(width, height);
            width = values.width;
            height = values.height;
            screenPoint = this._calculateAlignmentPosition(screenPoint.x, screenPoint.y, width, height);
            if (!screenPoint) return null;
            return {
                top: void 0 !== screenPoint.top ? `${screenPoint.top.toFixed()}px` : "auto",
                left: void 0 !== screenPoint.left ? `${screenPoint.left.toFixed()}px` : "auto",
                bottom: void 0 !== screenPoint.bottom ? `${screenPoint.bottom.toFixed()}px` : "auto",
                right: void 0 !== screenPoint.right ? `${screenPoint.right.toFixed()}px` : "auto",
            };
        }
        return null;
    }

    _calculateFullWidth = (width, height) => {
        const { currentAlignment, _pointerOffsetInPx } = this;
        width = (currentAlignment === "top-left" ||
            currentAlignment === "bottom-left" ||
            currentAlignment === "top-right" ||
            currentAlignment === "bottom-right") ? width + _pointerOffsetInPx : width;
        height = (currentAlignment === 'left-top' ||
            currentAlignment === 'left-bottom' ||
            currentAlignment === 'right-top' ||
            currentAlignment === 'right-bottom') ? height + _pointerOffsetInPx : height;

        return { width, height };
    }

    _calculateAlignmentPosition = (screenPointX, screenPointY, width, height) => {
        const { currentAlignment, _pointerOffsetInPx } = this;
        width /= 2;
        height /= 2;
        const q = this.mapView.height - screenPointY;
        const b = this.mapView.width - screenPointX;
        const { padding } = this.mapView;
        if (currentAlignment === "bottom-center")
            return { top: screenPointY + _pointerOffsetInPx - padding.top, left: screenPointX - width - padding.left };
        if (currentAlignment === "top-left")
            return { bottom: q + _pointerOffsetInPx - padding.bottom, right: b + _pointerOffsetInPx - padding.right };
        if (currentAlignment === "bottom-left")
            return { top: screenPointY + _pointerOffsetInPx - padding.top, right: b + _pointerOffsetInPx - padding.right };
        if (currentAlignment === "top-right")
            return { bottom: q + _pointerOffsetInPx - padding.bottom, left: screenPointX + _pointerOffsetInPx - padding.left };
        if (currentAlignment === "bottom-right")
            return { top: screenPointY + _pointerOffsetInPx - padding.top, left: screenPointX + _pointerOffsetInPx - padding.left };
        if (currentAlignment === "top-center")
            return { bottom: q + _pointerOffsetInPx - padding.bottom, left: screenPointX - width - padding.left };
        if (currentAlignment === "left-center")
            return { bottom: q - padding.bottom - height, left: screenPointX - width * 2 - padding.left - _pointerOffsetInPx };
        if (currentAlignment === "right-center")
            return { bottom: q - padding.bottom - height, left: screenPointX - padding.left + _pointerOffsetInPx };
        return null;
    };

    _onCloseButtonClick = (ags) => {
        const target = ags.target || ags.currentTarget;
        const uid = target?.getAttribute('id');
        if (!uid) {
            window.console.log(new Error('map:关闭overlay失败'));
            return;
        }
        const domTarget = this.domNodes[uid];
        const graphics = this.source.filter(item => {
            if (item?.getAttribute('id')?.toString() === uid) return true;
            return false;
        });
        if (graphics.length > 0) graphics[0].visible = false;
        domTarget.container.remove();
        delete this.domNodes[uid];
    }

    queryDataFromFeatureLayer(layer) {
        this.mapView?.whenLayerView(layer).then((layerView) => {
            const waitLayerViewUpdated = setInterval(() => {
                if (!layerView.updating) {
                    clearInterval(waitLayerViewUpdated);
                }
                layerView.queryFeatures().then(featureSet => {
                    const { features } = featureSet;
                    this.reposition(features);
                });
            }, 200);
        });
    }

    queryDataFromGraphicsLayer(layer) {
        this.mapView?.whenLayerView(layer).then((layerView) => {
            layerView.queryGraphics().then((results) => {
                this.reposition(results);
            });
        });
    }

    destroy() {
        this.source = null;
        this.mapView.ui.remove(this.uiKey);
    }
}
