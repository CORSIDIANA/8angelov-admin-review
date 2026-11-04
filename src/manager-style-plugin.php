<?php
/**
 * File included by ONE native plugin bound only to OnManagerPageBeforeRender.
 * Native event supplies $modx and $controller. Do not execute as a web endpoint.
 */
if (!isset($modx, $controller) || !($modx instanceof modX)
    || !($controller instanceof modManagerController)
    || !isset($modx->event) || $modx->event->name !== 'OnManagerPageBeforeRender') {
    return;
}
require __DIR__ . '/owner-draft-plugin.php';
require_once __DIR__ . '/common.php';
if (!angelManagerSession($modx)) {
    return;
}
$config = angelManagerConfig();
$assets = angelManagerAssets($config);
if ($assets === '') {
    return;
}
$controller->addCss($assets . 'manager.css?v=c8cf194c6082822e3dba730f8fe99f8fc4c041ca3d24459dbe2717064d99985a');

// One native resource editor adapter; it declines every other manager route.
$controller->addJavascript($assets . 'native-editor-frame.js?v=72d38eb65b927beb5dbfc78b2c8b8bf626d5595641a43607eb0d9879589f6bf8');
$controller->addHtml('<script>if(window.AngelNativeEditorFrame){window.AngelNativeEditorFrame.start({enabled:true});}</script>');
if (isset($_GET['a']) && $_GET['a'] === 'resource/create') $controller->addJavascript($assets . 'native-create-ack-rich-xhr6r5.js?v=3c730f3f92de9d7933edb8813fa4943deb2a0546944b7ee7cfea9ce8ee12dfef');
