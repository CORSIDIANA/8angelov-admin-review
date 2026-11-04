/* Native editor responsive 1. SOURCE ONLY: runtime/UI checks NOT_RUN.
 * R2: stock find; one post-stack attach; owned callback/cleanup failures contained.
 * B1: owned hidden east is seeded by delegated getEast BEFORE initial viewport render.
 * Native-panel cleanup hides/empties this seed; viewport lifetime owns its Region.
 * Requires native MODX/Ext only. Explicit start({enabled:true}); no Draft/MP/RTE.
 * Reuses frame-ownership1r1/owner-layout.js (8c0d36e1...) east-region/job ownership.
 * Native witness: layout f40b1573..., resource panel f39e47a3..., update b9745ddb....
 * PREPARED controls, NOT_RUN: foreign east/duplicate start; cancelled beforedestroy
 * versus actual destroy; superseded fetch/load; unpublished/deleted/SymLink/invalid
 * id/origin; redirects/non-HTML/oversize/timeout; width ownership and narrow modal.
 * B1 prepared NOT_RUN: pre-render seed / foreign getter / late viewport refusal;
 * owner-marker or Region.panel mismatch; cancelled destroy retains; actual destroy
 * hides seed without removing Region; foreign getter replacement survives cleanup.
 * Pure prepared witnesses: resourceState({id:1,class_key:'modDocument',published:1,
 * deleted:0}) => published; same with published:0 => unavailable; id:true, class_key
 * modSymLink, missing published/deleted => null. These are definitions, NOT_RUN.
 */
(function (root) {
  'use strict';
  if (root.AngelNativeEditorFrame) return;
  var current = null;
  var ORIGIN = 'https://app.obsidiancore.it.com:18832';
  var LIMIT = 524288;
  var BODY_CLASS = 'angel-native-editor-frame';
  var EAST_ID = 'angel-native-editor-preview';

  function resourceState(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    var id = record.id;
    if (typeof id === 'string' && /^[1-9][0-9]*$/.test(id)) id = Number(id);
    if (!Number.isSafeInteger(id) || id < 1 || record.class_key !== 'modDocument') return null;
    function yes(value) { return value === true || value === 1 || value === '1'; }
    function no(value) { return value === false || value === 0 || value === '0'; }
    if ((!yes(record.published) && !no(record.published))
        || (!yes(record.deleted) && !no(record.deleted))) return null;
    return {id:id, published:yes(record.published), deleted:yes(record.deleted)};
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function start(config) {
    if (!config || config.enabled !== true || !root.Ext || !root.MODx
        || root.location.origin !== ORIGIN) return null;
    if (current && !current.disposed) return current;
    var Ext = root.Ext, MODx = root.MODx;
    if (!MODx.request || MODx.request.a !== 'resource/update'
        || !MODx.Layout || !MODx.Layout.prototype
        || typeof MODx.Layout.prototype.getEast !== 'function'
        || Ext.getCmp('modx-layout') || Ext.getCmp(EAST_ID)) return null;
    var layoutPrototype = MODx.Layout.prototype;
    var priorGetEast = layoutPrototype.getEast, ownGetEast = null;
    var seedViewport = null, seedConfig = null;
    var disposed = false, mounted = false, waiting = null, readyBound = false;
    var waitTimer = null, resizeTicket = null, attachTask = null;
    var callbackPairs = [], cleanupFailed = false, failureNode = null, destroyBound = null;
    var nativePanel = null, viewport = null, west = null, center = null, east = null;
    var surface = null, canvas = null, message = null, link = null;
    var launchHost = null, launchButton = null, refreshButton = null;
    var desktopButton = null, phoneButton = null, dialog = null;
    var restoreFocus = null, frame = null, pending = null, phone = false;
    var persisted = null, wide = false, bodyHadClass = false, barBlocked = false;
    var previewAvailable = null, closingFocus = null;
    var westInitial = null, westLast = null, westOwned = true;
    var geometryPrevious = null, geometryWritten = false, geometryCurrent;
    var toolbarPrevious = null, toolbarCurrent;
    var variables = {}, variablePrevious = {};
    var controller = {disposed:false, dispose:dispose, status:'WAITING',
      cleanupStatus:'NOT_STARTED', diagnosticCode:null, diagnosticVisible:false};
    current = controller;

    function cleanupStep(fn) {
      try { fn(); } catch (error) { cleanupFailed = true; }
    }
    function diagnostic() {
      try {
        if (!failureNode) {
          failureNode = element('p','angel-editor-frame-failure');
          failureNode.setAttribute('role','status');
          var host = nativePanel && !nativePanel.isDestroyed && !nativePanel.destroying && nativePanel.getEl();
          (host && host.dom && document.documentElement.contains(host.dom) ? host.dom : document.body)
            .appendChild(failureNode);
        }
        failureNode.textContent = 'Современный вид недоступен [' + controller.diagnosticCode
          + ']. Используйте штатную форму MODX. Очистка: ' + controller.cleanupStatus + '.';
        controller.diagnosticVisible = document.documentElement.contains(failureNode);
      } catch (error) { controller.diagnosticVisible = false; }
    }
    function ownFailure() {
      controller.status = 'DEGRADED';
      controller.diagnosticCode = controller.diagnosticCode || 'ANGEL_FRAME_CALLBACK_ERROR';
      dispose(); diagnostic();
    }
    function guarded(fn) {
      for (var i = 0; i < callbackPairs.length; i++)
        if (callbackPairs[i].fn === fn) return callbackPairs[i].safe;
      var safe = function () {
        if (disposed) return;
        try { fn.apply(this,arguments); } catch (error) { ownFailure(); }
        // A native event must never receive false or a cancelled-operation value.
      };
      callbackPairs.push({fn:fn,safe:safe}); return safe;
    }
    function previewFault(code) {
      var error = new Error(code); error.angelExpectedPreview = true; return error;
    }
    function promiseGuard(fn) {
      return function () {
        function rejected(error) {
          if (!error || error.angelExpectedPreview !== true) ownFailure();
          throw error;
        }
        try {
          var value = fn.apply(this,arguments);
          return value && typeof value.then === 'function' ? value.catch(rejected) : value;
        } catch (error) { return rejected(error); }
      };
    }
    function restoreGetter() {
      if (ownGetEast && layoutPrototype.getEast === ownGetEast)
        layoutPrototype.getEast = priorGetEast;
    }
    function ownedSeed() {
      if (!seedViewport || !seedConfig || seedViewport.isDestroyed) return null;
      var candidate = Ext.getCmp(EAST_ID);
      if (!candidate || candidate.isDestroyed
          || candidate.angelNativeFrameSeedOwner !== controller
          || candidate.ownerCt !== seedViewport) return null;
      var layout = seedViewport.getLayout();
      if (!layout || layout.type !== 'border' || !layout.rendered
          || !layout.east || layout.east.panel !== candidate) return null;
      return candidate;
    }
    function installSeed() {
      ownGetEast = function (config) {
        var previous;
        try { previous = priorGetEast.apply(this,arguments); }
        catch (error) {
          cleanupStep(restoreGetter); dispose(); throw error; // Preserve foreign exception identity.
        }
        try {
        // A foreign getter's result, including an unusual defined result, wins.
        if (disposed || previous !== undefined && previous !== null || seedViewport
            || !(this instanceof MODx.Layout) || !MODx.request
            || MODx.request.a !== 'resource/update' || Ext.getCmp('modx-layout')
            || Ext.getCmp(EAST_ID)) {
          restoreGetter(); if (!disposed) dispose(); return previous;
        }
        seedViewport = this;
        seedConfig = {id:EAST_ID,region:'east',width:496,minSize:360,hidden:true,
          split:false,border:false,autoScroll:true,cls:'angel-editor-preview-region',
          angelNativeFrameSeedOwner:controller};
        // buildLayout consumes this initial config. Native BorderLayout creates
        // its Region during its first onLayout; no late add/reset/private surgery.
        restoreGetter();
        return seedConfig;
        } catch (error) { ownFailure(); return previous; }
      };
      layoutPrototype.getEast = ownGetEast;
    }
    function stopWaiting() {
      var timer = waitTimer, task = attachTask, panel = waiting, bound = readyBound;
      waitTimer = null; attachTask = null; waiting = null; readyBound = false;
      cleanupStep(function () { clearTimeout(timer); });
      cleanupStep(function () { clearTimeout(task); });
      if (panel) cleanupStep(function () { panel.un('load',guarded(whenReady)); });
      if (bound) cleanupStep(function () { MODx.un('ready',guarded(findPanel)); });
      if (cleanupFailed && !disposed) throw new Error('owned_cleanup_failed');
    }
    function exactOwner() {
      return nativePanel && nativePanel.angelNativeEditorFrame === controller;
    }
    function retire(job) {
      if (!job || job.state !== 'pending') return;
      job.state = 'obsolete';
      cleanupStep(function () { job.controller.abort(); });
      cleanupStep(function () { clearTimeout(job.timer); });
      var reader = job.reader, candidate = job.frame;
      job.reader = null; job.frame = null;
      if (reader) cleanupStep(function () { reader.cancel().catch(function () {}); });
      if (candidate) {
        cleanupStep(function () { candidate.onload = null; candidate.onerror = null; });
        if (candidate !== frame) cleanupStep(function () { candidate.remove(); });
      }
      if (cleanupFailed && !disposed) throw new Error('owned_cleanup_failed');
    }
    function cancelPending() {
      if (pending) { var old = pending; pending = null; retire(old); }
    }
    function clearFrame() {
      cancelPending();
      if (frame) { frame.onload = null; frame.onerror = null; frame.remove(); frame = null; }
    }
    function publishedUrl() {
      if (!persisted || !persisted.published || persisted.deleted) return null;
      var url = new URL('/?id=' + persisted.id, ORIGIN);
      return url.origin === ORIGIN && url.pathname === '/' ? url : null;
    }
    function captureClosingFocus() {
      if (disposed || !exactOwner() || !dialog || !dialog.isVisible()) {
        closingFocus = null; return;
      }
      var dialogElement = dialog.getEl(), active = document.activeElement;
      var owned = !!(dialogElement && dialogElement.dom && dialogElement.dom.contains(active));
      if (!closingFocus || closingFocus.dialog !== dialog) {
        closingFocus = {dialog:dialog, owned:owned};
      } else if (!owned && active !== document.body && active !== document.documentElement) {
        // A newer outside focus cancels return; cleanup-induced body never grants it.
        closingFocus.owned = false;
      }
    }
    function availability(note) {
      var url = publishedUrl();
      if (url) closingFocus = null;
      else captureClosingFocus(); // Before disabling, hiding, removing or moving any node.
      var changed = previewAvailable !== null && previewAvailable !== !!url;
      previewAvailable = !!url;
      refreshButton.disabled = !url;
      launchHost.classList.toggle('angel-editor-preview-launch--unavailable', !url);
      launchButton.hidden = !url;
      if (url) {
        if (message.parentNode !== surface) surface.insertBefore(message, link);
        link.href = url.href; link.hidden = false;
        message.textContent = note || 'Опубликованная версия · статичный вид';
      } else {
        link.hidden = true; link.removeAttribute('href'); clearFrame();
        message.textContent = persisted && !persisted.published && !persisted.deleted
          ? 'Страница не опубликована. Опубликованная версия недоступна.'
          : 'Опубликованный просмотр недоступен для этого ресурса.';
        // Keep the existing status accessible outside the hidden east region.
        if (message.parentNode !== launchHost) launchHost.appendChild(message);
      }
      // Initial attach already resizes; native success reuses the owned scheduler.
      if (changed) scheduleResize();
    }
    function fit() {
      if (disposed || !canvas) return;
      var available = canvas.clientWidth;
      if (!available) return;
      var target = phone ? 390 : 1280;
      var scale = Math.min(1, available / target);
      var height = Math.max(240, canvas.clientHeight || 480);
      canvas.querySelectorAll('iframe').forEach(function (node) {
        node.style.width = target + 'px';
        node.style.height = Math.ceil(height / scale) + 'px';
        node.style.transformOrigin = '0 0';
        node.style.transform = 'scale(' + scale + ')';
      });
    }
    function device(mobile) {
      phone = mobile;
      surface.classList.toggle('angel-editor-preview--phone', mobile);
      desktopButton.setAttribute('aria-pressed', String(!mobile));
      phoneButton.setAttribute('aria-pressed', String(mobile));
      fit();
    }
    function setVariable(name,value) {
      var style = document.body.style;
      if (!Object.prototype.hasOwnProperty.call(variablePrevious,name)) {
        variablePrevious[name] = {value:style.getPropertyValue(name),
          priority:style.getPropertyPriority(name)};
      } else if (variables[name] !== undefined && style.getPropertyValue(name) !== variables[name]) {
        return; // A later owner changed this variable. Do not overwrite it.
      }
      style.setProperty(name,value); variables[name] = value;
    }
    function nativeFlow() {
      var mode = root.matchMedia('(max-width: 640px)').matches;
      if (typeof mode !== 'boolean') throw new Error('owned_mode_unknown');
      return mode;
    }
    function toolbarFit(fits) {
      var body = document.body, name = 'data-angel-editor-toolbar-fit';
      var actual = body.getAttribute(name);
      if (actual !== (toolbarCurrent === undefined ? toolbarPrevious : toolbarCurrent)) return false;
      var value = fits ? 'ready' : 'native';
      if (actual !== value) body.setAttribute(name,value);
      toolbarCurrent = value; return true;
    }
    function releaseGeometry() {
      if (geometryWritten && document.body.getAttribute('data-angel-editor-geometry') === geometryCurrent) {
        document.body.removeAttribute('data-angel-editor-geometry'); geometryCurrent = null;
      }
      toolbarFit(false);
    }
    function measure() {
      if (disposed || !mounted || !exactOwner()) return;
      if (nativeFlow()) { releaseGeometry(); return; }
      if (!center || !center.getEl()) return;
      if (!toolbarFit(false)) return;
      var box = center.getEl().dom.getBoundingClientRect();
      var bar = document.getElementById('modx-action-buttons');
      var barBox = bar && bar.getBoundingClientRect();
      if (!Number.isFinite(box.left) || !Number.isFinite(box.top) || !Number.isFinite(box.width)
          || box.left < 0 || box.top < 0 || box.width <= 0 || !barBox
          || !Number.isFinite(barBox.height) || barBox.height <= 0 || barBox.width <= 0) {
        releaseGeometry(); return;
      }
      setVariable('--angel-editor-center-left', Math.round(box.left) + 'px');
      setVariable('--angel-editor-center-width', Math.floor(box.width) + 'px');
      setVariable('--angel-editor-center-top', Math.round(box.top) + 'px');
      setVariable('--angel-editor-bar-height', Math.ceil(barBox.height) + 'px');
      var fullWidth = Math.max(barBox.width,bar.scrollWidth);
      var fits = fullWidth <= box.width && box.left + fullWidth <= root.innerWidth;
      if (wide && !fits) { barBlocked = true; scheduleResize(); }
      if (!geometryWritten || document.body.getAttribute('data-angel-editor-geometry') === geometryCurrent) {
        document.body.setAttribute('data-angel-editor-geometry','ready');
        geometryWritten = true; geometryCurrent = 'ready';
      }
      toolbarFit(fits); fit();
    }
    function adjustWest(desired) {
      if (nativeFlow() || !westOwned || west.collapsed) return;
      var value = west.getWidth();
      if (westLast !== null && value !== westLast) { westOwned = false; return; }
      if (westLast === null && value !== westInitial) { westOwned = false; return; }
      if (value !== desired) { west.setWidth(desired); westLast = west.getWidth(); }
    }
    function resize() {
      if (disposed || !mounted || !exactOwner()) return;
      var hasPreview = !!publishedUrl();
      if (hasPreview) closingFocus = null;
      else captureClosingFocus(); // Also covers a layout entry before availability.
      if (!hasPreview && dialog && dialog.isVisible()) {
        launchHost.hidden = false;
        dialog.hide();
      }
      if (nativeFlow()) {
        wide = false; east.hide(); launchHost.hidden = false; releaseGeometry();
        if (dialog && dialog.isVisible()) arrangeModal();
        return;
      }
      if (westInitial === null && westOwned && !west.collapsed) {
        var nativeWidth = west.getWidth();
        if (!Number.isFinite(nativeWidth) || nativeWidth <= 0) throw new Error('owned_width_unknown');
        westInitial = nativeWidth;
      }
      var available = viewport.getWidth();
      if (available >= 1240) adjustWest(available >= 1500 ? 294 : 260);
      var usedWest = west.collapsed ? 0 : west.getWidth();
      var wanted = available >= 1500 ? 496 : 360;
      var allowed = Math.min(wanted, available - usedWest - 616);
      wide = hasPreview && available >= 1240 && allowed >= 360 && !barBlocked;
      if (wide) {
        if (dialog && dialog.isVisible()) dialog.hide();
        east.setWidth(allowed); east.show(); launchHost.hidden = true;
      } else {
        east.hide(); launchHost.hidden = false;
      }
      viewport.doLayout();
      if (dialog && dialog.isVisible()) {
        arrangeModal();
      }
      measure();
    }
    function scheduleResize(event) {
      if (event && event.type === 'resize') barBlocked = false;
      if (resizeTicket !== null) return;
      resizeTicket = root.requestAnimationFrame(guarded(function () { resizeTicket = null; resize(); }));
    }
    function modalHide() {
      var target = restoreFocus, snapshot = closingFocus;
      closingFocus = null;
      restoreFocus = null; // Release even on an early return or a contained failure.
      if (disposed || !surface) return;
      if (!publishedUrl()) {
        // Body after our cleanup is neutral, not evidence of prior dialog ownership.
        target = snapshot && snapshot.dialog === dialog && snapshot.owned ? message : null;
      }
      var active = document.activeElement;
      var dialogElement = dialog && dialog.getEl();
      var mayReturn = active === document.body || active === document.documentElement
        || active === target || dialogElement && dialogElement.dom
          && dialogElement.dom.contains(active);
      if (east && east.body && east.body.dom) east.body.dom.appendChild(surface);
      // Two explicit owned targets only; no search for an arbitrary form control.
      var panelElement = exactOwner() && nativePanel.getEl();
      if (mayReturn && panelElement && panelElement.dom && launchHost
          && (target === launchButton || target === message && !publishedUrl())
          && target && target.parentNode === launchHost
          && panelElement.dom.contains(launchHost)
          && document.documentElement.contains(target)
          && !target.closest('[hidden],[inert],[aria-hidden="true"],[aria-disabled="true"],:disabled,.x-item-disabled')
          && target.getClientRects().length) {
        var visible = true;
        // A finite ancestor walk validates this target, including hidden containers.
        for (var node = target; visible && node; node = node.parentElement) {
          var style = root.getComputedStyle(node);
          visible = style.display !== 'none' && style.visibility === 'visible'
            && Number(style.opacity) !== 0;
        }
        if (visible) {
          if (target === message) target.setAttribute('tabindex','-1');
          target.focus();
        }
      }
      fit();
    }
    function arrangeModal() {
      if (!dialog || !dialog.isVisible()) return;
      var width = Math.min(900,root.innerWidth - 32), height = root.innerHeight - 48;
      var chrome = dialog.getFrameHeight();
      if (!Number.isFinite(chrome) || chrome < 0 || width <= 0 || height <= chrome)
        throw new Error('owned_modal_bounds');
      var dom = dialog.getEl().dom;
      dom.style.setProperty('width',width + 'px','important');
      dom.style.setProperty('max-width',width + 'px','important');
      dom.style.setProperty('right','auto','important');
      dialog.body.dom.style.setProperty('--angel-editor-modal-body-height',(height - chrome) + 'px');
      dialog.setSize(width,height); dialog.doLayout(); fit(); dialog.center();
      var box = dom.getBoundingClientRect();
      if (!Number.isFinite(box.width) || box.width <= 0 || box.width > root.innerWidth)
        throw new Error('owned_modal_bounds');
      dom.style.setProperty('left',Math.max(0,Math.round((root.innerWidth - box.width) / 2)) + 'px','important');
    }
    function openPreview() {
      if (disposed || !exactOwner()) return;
      closingFocus = null; // A new opening cannot inherit a previous transition.
      if (!nativeFlow() && wide) { east.show(); viewport.doLayout(); measure(); return; }
      if (!dialog) {
        dialog = new Ext.Window({title:'Предпросмотр', modal:true, closeAction:'hide',
          cls:'angel-editor-preview-dialog',constrain:true,resizable:false,
          width:Math.min(900,root.innerWidth - 32), height:Math.max(240,root.innerHeight - 48),
          layout:'fit', listeners:{hide:guarded(modalHide),resize:guarded(fit)}});
      }
      restoreFocus = launchButton;
      dialog.show(); dialog.body.dom.appendChild(surface); arrangeModal();
    }
    async function limitedHtml(response,job) {
      var length = response.headers.get('Content-Length');
      if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > LIMIT))
        throw previewFault('preview_size');
      if (!response.body || typeof response.body.getReader !== 'function')
        throw previewFault('preview_stream');
      var reader = response.body.getReader(), chunks = [], total = 0;
      job.reader = reader;
      try {
        while (true) {
          var item;
          try { item = await reader.read(); } catch (error) { throw previewFault('preview_transport'); }
          if (disposed || pending !== job || job.state !== 'pending') throw previewFault('preview_obsolete');
          if (item.done) break;
          total += item.value.byteLength;
          if (total > LIMIT) throw previewFault('preview_size');
          chunks.push(item.value);
        }
        var bytes = new Uint8Array(total), offset = 0;
        chunks.forEach(function (chunk) { bytes.set(chunk,offset); offset += chunk.byteLength; });
        try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
        catch (error) { throw previewFault('preview_encoding'); }
      } finally { job.reader = null; reader.releaseLock(); }
    }
    function staticHtml(html) {
      // Template contents are inert and are NEVER attached to the manager DOM.
      // Remove navigation/active elements before the isolated srcdoc is assigned.
      var template = document.createElement('template');
      template.innerHTML = html;
      template.content.querySelectorAll('base,meta[http-equiv],script,noscript,template,iframe,frame,frameset,object,embed,form')
        .forEach(function (node) { node.remove(); });
      template.content.querySelectorAll('link').forEach(function (node) {
        if ((node.getAttribute('rel') || '').toLowerCase() !== 'stylesheet') node.remove();
      });
      template.content.querySelectorAll('*').forEach(function (node) {
        Array.prototype.slice.call(node.attributes).forEach(function (attribute) {
          if (attribute.name.toLowerCase().indexOf('on') === 0) node.removeAttribute(attribute.name);
        });
        node.removeAttribute('autofocus'); node.removeAttribute('contenteditable');
        if (node.localName === 'a' || node.localName === 'area') {
          ['href','xlink:href','target','download','ping'].forEach(function (name) { node.removeAttribute(name); });
        }
        if (/^(input|button|textarea|select)$/.test(node.localName)) node.setAttribute('disabled','');
      });
      var result = template.innerHTML;
      if (new TextEncoder().encode(result).byteLength > LIMIT) throw previewFault('preview_size');
      return result;
    }
    function refresh() {
      if (disposed || !exactOwner()) return;
      cancelPending();
      var url = publishedUrl();
      if (!url) { availability(); return; }
      var job = {controller:new AbortController(),reader:null,frame:null,timer:null,state:'pending'};
      pending = job;
      message.textContent = 'Загружаем опубликованную версию…';
      function failed() {
        if (disposed || pending !== job || job.state !== 'pending') return;
        pending = null; retire(job);
        message.textContent = frame
          ? 'Не удалось обновить. Показан предыдущий статичный просмотр; откройте опубликованную страницу.'
          : 'Предпросмотр недоступен. Можно открыть опубликованную страницу отдельно.';
      }
      job.timer = root.setTimeout(guarded(failed),12000);
      root.fetch(url.href,{credentials:'omit',redirect:'error',cache:'no-store',
        referrerPolicy:'no-referrer',signal:job.controller.signal})
        .then(promiseGuard(function (response) {
          if (disposed || pending !== job || job.state !== 'pending') throw previewFault('preview_obsolete');
          var type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
          if (response.status !== 200 || response.url !== url.href || type !== 'text/html')
            throw previewFault('preview_response');
          return limitedHtml(response,job);
        })).then(promiseGuard(function (html) {
          if (disposed || pending !== job || job.state !== 'pending') return;
          html = staticHtml(html);
          var next = element('iframe','angel-editor-preview__frame');
          next.title = 'Опубликованная версия · статичный вид';
          next.setAttribute('sandbox',''); next.setAttribute('referrerpolicy','no-referrer');
          next.setAttribute('tabindex','-1'); next.setAttribute('inert','');
          next.style.pointerEvents = 'none'; job.frame = next;
          next.onload = guarded(function () {
            if (job.state === 'current' && frame === next) return;
            if (disposed || pending !== job || job.state !== 'pending') {
              next.onload = null; next.onerror = null;
              if (next !== frame) next.remove();
              return;
            }
            clearTimeout(job.timer); pending = null; job.state = 'current';
            next.onload = null; next.onerror = null;
            var previous = frame; frame = next; job.frame = null;
            if (previous && previous !== next) previous.remove();
            message.textContent = 'Опубликованная версия · статичный вид'; fit();
          });
          next.onerror = guarded(failed);
          var csp = "default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; "
            + "form-action 'none'; frame-src 'none'; worker-src 'none'; media-src 'none'; "
            + "img-src " + ORIGIN + " data:; style-src " + ORIGIN + " 'unsafe-inline'; font-src " + ORIGIN + "; "
            + "base-uri " + ORIGIN + "; navigate-to 'none'";
          // Policy precedes every byte of fetched HTML. Sandbox stays opaque and
          // scriptless; no manager HTML insertion, iframe DOM reads or security fallback.
          next.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="'
            + csp + '"><base href="' + ORIGIN + '/">' + html;
          canvas.appendChild(next); fit();
        })).catch(guarded(failed));
    }
    function saved(result) {
      if (disposed || !exactOwner()) return;
      captureClosingFocus(); // cancelPending may remove the focused pending frame.
      cancelPending();
      var object = result && result.result && result.result.object;
      var next = resourceState(object);
      persisted = next && persisted && next.id === persisted.id ? next : null;
      availability('Сохранено в MODX. Обновите предпросмотр опубликованной версии.');
    }
    function button(text,fn,className) {
      var node = element('button',className,text); node.type = 'button';
      node.addEventListener('click',guarded(fn)); return node;
    }
    function attach() {
      if (disposed || mounted) return;
      if (!nativePanel || nativePanel.isDestroyed || nativePanel.destroying
          || !nativePanel.initialized || !nativePanel.isReady) return;
      if (!MODx.request || MODx.request.a !== 'resource/update') { dispose(); return; }
      if (nativePanel.angelNativeEditorFrame) { dispose(); return; }
      viewport = Ext.getCmp('modx-layout'); west = Ext.getCmp('modx-leftbar-tabs');
      center = Ext.getCmp('modx-content');
      east = ownedSeed();
      if (!viewport || viewport !== seedViewport || !west || !center || !viewport.items
          || !east || viewport.items.find(function (item) {
            return item.region === 'east' && item !== east;
          })) {
        dispose(); return;
      }
      var record = nativePanel.record || nativePanel.config.record;
      persisted = resourceState(record);
      if (!persisted) { dispose(); return; }
      var actionbar = Ext.getCmp('modx-action-buttons');
      var page = MODx.activePage;
      if (nativePanel.ownerCt !== center || !page || !page.config
          || page.config.formpanel !== 'modx-panel-resource' || page.ab !== actionbar
          || !actionbar || actionbar.isDestroyed || actionbar.destroying || !actionbar.rendered
          || !actionbar.getEl() || !actionbar.getEl().dom) {
        controller.diagnosticCode = 'ANGEL_FRAME_NATIVE_PAGE_NOT_READY'; ownFailure(); return;
      }
      stopWaiting();
      surface = element('section','angel-editor-preview');
      surface.appendChild(element('h2','angel-editor-preview__heading','Предпросмотр'));
      surface.appendChild(element('p','angel-editor-preview__subtitle','Опубликованная версия · статичный вид'));
      var tools = element('div','angel-editor-preview__toolbar');
      refreshButton = button('Обновить',refresh,'angel-editor-preview__refresh');
      desktopButton = button('Компьютер',function () { device(false); },'angel-editor-preview__device');
      phoneButton = button('Телефон',function () { device(true); },'angel-editor-preview__device');
      desktopButton.setAttribute('aria-pressed','true'); phoneButton.setAttribute('aria-pressed','false');
      tools.append(refreshButton,desktopButton,phoneButton); surface.appendChild(tools);
      surface.appendChild(element('p','angel-editor-preview__device-note','Размер статичного просмотра, без эмуляции устройства.'));
      message = element('p','angel-editor-preview__status'); message.setAttribute('role','status');
      surface.appendChild(message);
      link = element('a','angel-editor-preview__link','Открыть опубликованную страницу');
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
      surface.appendChild(link);
      canvas = element('div','angel-editor-preview__canvas'); surface.appendChild(canvas);
      bodyHadClass = document.body.classList.contains(BODY_CLASS);
      geometryPrevious = document.body.getAttribute('data-angel-editor-geometry');
      toolbarPrevious = document.body.getAttribute('data-angel-editor-toolbar-fit');
      try {
        nativePanel.angelNativeEditorFrame = controller;
        // Adopt only our already registered native Region; no component reparenting.
        east.body.dom.appendChild(surface);
        launchHost = element('div','angel-editor-preview-launch');
        launchButton = button('Предпросмотр',openPreview,'angel-editor-preview-open');
        launchHost.appendChild(launchButton);
        nativePanel.getEl().dom.insertBefore(launchHost,nativePanel.getEl().dom.firstChild);
        document.body.classList.add(BODY_CLASS);
        mounted = true;
        // Native success changes published-snapshot eligibility only.
        nativePanel.on('success',guarded(saved));
        viewport.on('afterlayout',guarded(measure));
        east.on('resize',guarded(fit));
        root.addEventListener('resize',guarded(scheduleResize));
        availability(); resize();
        if (publishedUrl()) refresh();
        if (!disposed) controller.status = 'ATTACHED';
      } catch (error) { ownFailure(); }
    }
    function queueAttach() {
      if (disposed || attachTask !== null) return;
      var expected = nativePanel;
      attachTask = root.setTimeout(guarded(function () {
        attachTask = null;
        if (!expected || expected.isDestroyed || expected.destroying
            || Ext.getCmp('modx-panel-resource') !== expected) { dispose(); return; }
        attach();
      }),0);
    }
    function whenReady() {
      if (waiting) { waiting.un('load',guarded(whenReady)); waiting = null; }
      queueAttach();
    }
    function findPanel() {
      if (disposed) return;
      if (readyBound) { MODx.un('ready',guarded(findPanel)); readyBound = false; }
      nativePanel = Ext.getCmp('modx-panel-resource');
      if (!nativePanel) { dispose(); return; }
      if (!destroyBound) {
        nativePanel.on('destroy',guarded(dispose),null,{single:true}); destroyBound = nativePanel;
      }
      if (nativePanel.initialized && nativePanel.isReady) queueAttach();
      else { waiting = nativePanel; nativePanel.on('load',guarded(whenReady),null,{single:true}); }
    }
    function dispose() {
      if (disposed) return;
      closingFocus = null; restoreFocus = null;
      disposed = true; controller.disposed = true; controller.cleanupStatus = 'PENDING';
      cleanupStep(restoreGetter); cleanupStep(stopWaiting);
      cleanupStep(function () { if (resizeTicket !== null) root.cancelAnimationFrame(resizeTicket); });
      cleanupStep(function () { root.removeEventListener('resize',guarded(scheduleResize)); });
      cleanupStep(cancelPending);
      var old = frame; frame = null;
      if (old) {
        cleanupStep(function () { old.onload = null; old.onerror = null; });
        cleanupStep(function () { old.remove(); });
      }
      if (nativePanel) {
        cleanupStep(function () { nativePanel.un('destroy',guarded(dispose)); });
        cleanupStep(function () { nativePanel.un('success',guarded(saved)); });
      }
      if (viewport) cleanupStep(function () { viewport.un('afterlayout',guarded(measure)); });
      if (east) cleanupStep(function () { east.un('resize',guarded(fit)); });
      if (dialog) {
        cleanupStep(function () { dialog.un('hide',guarded(modalHide)); });
        cleanupStep(function () { dialog.un('resize',guarded(fit)); });
        cleanupStep(function () { dialog.destroy(); }); dialog = null;
      }
      if (launchHost) cleanupStep(function () { launchHost.remove(); });
      var remainingSeed = null;
      cleanupStep(function () { remainingSeed = ownedSeed(); });
      if (remainingSeed && !seedViewport.destroying) cleanupStep(function () { remainingSeed.hide(); });
      if (surface) cleanupStep(function () { surface.remove(); });
      cleanupStep(function () {
        if (nativeFlow()) {
          if (westOwned && westLast !== null && westInitial !== null && westLast !== westInitial
              && seedViewport && !seedViewport.isDestroyed && !seedViewport.destroying) {
            cleanupFailed = true; controller.diagnosticCode = 'ANGEL_FRAME_FLOW_RESTORE_SKIPPED';
          }
          return;
        }
        if (west && !west.isDestroyed && !west.destroying && westOwned
            && westLast !== null && west.getWidth() === westLast) west.setWidth(westInitial);
      });
      var ownsPanel = false; cleanupStep(function () { ownsPanel = exactOwner(); });
      if (ownsPanel) {
        Object.keys(variables).forEach(function (name) {
          cleanupStep(function () {
            var style = document.body.style, previous = variablePrevious[name];
            if (style.getPropertyValue(name) === variables[name]) {
              if (previous.value) style.setProperty(name,previous.value,previous.priority);
              else style.removeProperty(name);
            }
          });
        });
        cleanupStep(function () {
          if (geometryWritten && document.body.getAttribute('data-angel-editor-geometry') === geometryCurrent) {
            if (geometryPrevious === null) document.body.removeAttribute('data-angel-editor-geometry');
            else document.body.setAttribute('data-angel-editor-geometry',geometryPrevious);
          }
        });
        cleanupStep(function () {
          if (toolbarCurrent !== undefined && document.body.getAttribute('data-angel-editor-toolbar-fit') === toolbarCurrent) {
            if (toolbarPrevious === null) document.body.removeAttribute('data-angel-editor-toolbar-fit');
            else document.body.setAttribute('data-angel-editor-toolbar-fit',toolbarPrevious);
          }
        });
        cleanupStep(function () { if (!bodyHadClass) document.body.classList.remove(BODY_CLASS); });
        cleanupStep(function () { delete nativePanel.angelNativeEditorFrame; });
      }
      cleanupStep(function () {
        if (!nativeFlow() && seedViewport && !seedViewport.isDestroyed && !seedViewport.destroying && remainingSeed)
          seedViewport.doLayout();
      });
      controller.cleanupStatus = cleanupFailed ? 'PARTIAL' : 'COMPLETE';
      if (cleanupFailed) {
        controller.status = 'DEGRADED';
        controller.diagnosticCode = controller.diagnosticCode || 'ANGEL_FRAME_CLEANUP_PARTIAL';
      } else if (controller.status !== 'DEGRADED') controller.status = 'DISPOSED';
      if (controller.status === 'DEGRADED') diagnostic();
      if (current === controller) current = null;
    }
    // This executes synchronously from a plain head inline call, BEFORE native
    // Ext.onReady constructs the viewport. A late invocation was rejected above.
    try {
    installSeed();
    waitTimer = root.setTimeout(guarded(function () { if (!mounted) dispose(); }),10000);
    Ext.onReady(guarded(function () {
      if (disposed) return;
      nativePanel = Ext.getCmp('modx-panel-resource');
      if (nativePanel) findPanel();
      else { readyBound = true; MODx.on('ready',guarded(findPanel),null,{single:true}); }
    }));
    } catch (error) { ownFailure(); }
    return controller;
  }
  root.AngelNativeEditorFrame = Object.freeze({start:start});
}(window));
