import { RPM } from "../path.js";

/**
 * Mobile plugin metadata exported for the RPM runtime.
 */
const pluginName = "Virtual Gamepad";
const inject = RPM.Manager.Plugins.inject;

/**
 * DOM node identifiers used to avoid duplicates and to target containers quickly.
 */
const DPAD_ID = "rpm-mobile-dpad";
const ABXY_ID = "rpm-mobile-abxy";

/**
 * Hold / repeat behaviour constants tuned for a responsive touch experience.
 */
const REPEAT_DELAY = 180;
const REPEAT_INTERVAL = 60;

var showGamepad = RPM.Manager.Plugins.getParameter(pluginName, "Show Gamepad");

RPM.Manager.Plugins.registerCommand(pluginName, "Toggle Gamepad View", () => {
    showGamepad = !showGamepad;
    activateMobileControls();
});

/**
 * Resolve a plugin parameter value to a usable numeric key code.
 * Falls back to a provided default if the parameter is missing or invalid.
 */
const resolveKeyCode = (parameterName, fallback) => {
    try {
        const value = RPM.Manager.Plugins.getParameter(pluginName, parameterName);
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : fallback;
    }
    catch (_) {
        return fallback;
    }
};

/**
 * Frequently used key codes fetched via plugin parameters so that users
 * can reconfigure them directly from the engine UI.
 */
const KEY_CODES = {
    up: resolveKeyCode("MoveUpKeyCode", RPM.Datas.Keyboards.controls.UpHero ? RPM.Datas.Keyboards.controls.UpHero.sc?.[0]?.[0] ?? 87 : 87),
    down: resolveKeyCode("MoveDownKeyCode", RPM.Datas.Keyboards.controls.DownHero ? RPM.Datas.Keyboards.controls.DownHero.sc?.[0]?.[0] ?? 83 : 83),
    left: resolveKeyCode("MoveLeftKeyCode", RPM.Datas.Keyboards.controls.LeftHero ? RPM.Datas.Keyboards.controls.LeftHero.sc?.[0]?.[0] ?? 65 : 65),
    right: resolveKeyCode("MoveRightKeyCode", RPM.Datas.Keyboards.controls.RightHero ? RPM.Datas.Keyboards.controls.RightHero.sc?.[0]?.[0] ?? 68 : 68),
    action: resolveKeyCode("ActionKeyCode", RPM.Datas.Keyboards.menuControls.Action ? RPM.Datas.Keyboards.menuControls.Action.sc?.[0]?.[0] ?? 13 : 13),
    cancel: resolveKeyCode("CancelKeyCode", RPM.Datas.Keyboards.menuControls.Cancel ? RPM.Datas.Keyboards.menuControls.Cancel.sc?.[0]?.[0] ?? 27 : 27),
    buttonX: resolveKeyCode("ButtonXKeyCode", RPM.Datas.Keyboards.menuControls.ButtonX ? RPM.Datas.Keyboards.menuControls.ButtonX.sc?.[0]?.[0] ?? 13 : 13),
    buttonY: resolveKeyCode("ButtonYKeyCode", RPM.Datas.Keyboards.menuControls.ButtonY ? RPM.Datas.Keyboards.menuControls.ButtonY.sc?.[0]?.[0] ?? 27 : 27),
};

/**
 * Build a fully qualified asset URL relative to this module.
 */
const assetURL = (relativePath) => new URL(`./assets/${relativePath}`, import.meta.url).href;

/**
 * Shared state for pointer → key mapping, and for auto-repeat timers.
 */
const pointerToKey = new Map();
const activeRepeats = new Map();

/**
 * Utility guard that ensures we only send inputs when the game is ready.
 */
const isReady = () => RPM.Main.loaded && !RPM.Manager.Stack.isLoading();

/**
 * Cancel any repeat timers associated with the provided key code.
 */
const clearRepeat = (keyCode) => {
    const repeatTimers = activeRepeats.get(keyCode);
    if (!repeatTimers) {
        return;
    }
    if (repeatTimers.delay !== null) {
        window.clearTimeout(repeatTimers.delay);
    }
    if (repeatTimers.interval !== null) {
        window.clearInterval(repeatTimers.interval);
    }
    activeRepeats.delete(keyCode);
};

/**
 * Possess the same behaviour as a hardware key press:
 * - register the key in the shared pressed list
 * - fire RPM's pressed and repeat handlers
 * - schedule continuous repeats while the pointer stays down
 */
const pressKey = (keyCode) => {
    if (!isReady()) {
        return;
    }
    if (!RPM.Common.Inputs.keysPressed.includes(keyCode)) {
        RPM.Common.Inputs.keysPressed.push(keyCode);
        RPM.Manager.Stack.onKeyPressed(keyCode);
    }
    RPM.Manager.Stack.onKeyPressedAndRepeat(keyCode);
    clearRepeat(keyCode);
    const delay = window.setTimeout(() => {
        const interval = window.setInterval(() => {
            if (isReady() && RPM.Common.Inputs.keysPressed.includes(keyCode)) {
                RPM.Manager.Stack.onKeyPressedAndRepeat(keyCode);
            }
        }, REPEAT_INTERVAL);
        activeRepeats.set(keyCode, { delay: null, interval });
    }, REPEAT_DELAY);
    activeRepeats.set(keyCode, { delay, interval: null });
};

/**
 * Release a key by reversing the bookkeeping done during press,
 * including clearing the auto-repeat timers.
 */
const releaseKey = (keyCode) => {
    if (!isReady()) {
        return;
    }
    clearRepeat(keyCode);
    const index = RPM.Common.Inputs.keysPressed.indexOf(keyCode);
    if (index !== -1) {
        RPM.Common.Inputs.keysPressed.splice(index, 1);
    }
    RPM.Manager.Stack.onKeyReleased(keyCode);
};

/**
 * Create a button element that renders a supplied image and triggers
 * the provided key code whenever it is held.
 */
const createTouchButton = ({ id, label, keyCode, imageFile, gridArea }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.button = id;
    button.style.gridArea = gridArea;
    button.style.background = "transparent";
    button.style.border = "none";
    button.style.padding = "0";
    button.style.margin = "0";
    button.style.touchAction = "none";
    button.style.pointerEvents = "auto";
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";

    const img = document.createElement("img");
    img.alt = label;
    img.src = assetURL(imageFile);
    img.style.maxWidth = "100%";
    img.style.pointerEvents = "none";
    button.appendChild(img);

    const handlePointerDown = (event) => {
        event.preventDefault();
        pointerToKey.set(event.pointerId, keyCode);
        event.currentTarget.setPointerCapture(event.pointerId);
        pressKey(keyCode);
    };

    const handlePointerUp = (event) => {
        const activeKeyCode = pointerToKey.get(event.pointerId);
        if (typeof activeKeyCode !== "number") {
            return;
        }
        pointerToKey.delete(event.pointerId);
        releaseKey(activeKeyCode);
    };

    button.addEventListener("pointerdown", handlePointerDown);
    button.addEventListener("pointerup", handlePointerUp);
    button.addEventListener("pointercancel", handlePointerUp);
    button.addEventListener("lostpointercapture", handlePointerUp);

    return button;
};

/**
 * Build and mount the left D-Pad cluster made from image assets.
 */
const mountDPad = () => {
    if (document.getElementById(DPAD_ID)) {
        return;
    }
    const container = document.createElement("div");
    container.id = DPAD_ID;
    container.style.position = "fixed";
    container.style.left = "4vw";
    container.style.bottom = "14vh";
    container.style.width = "180px";
    container.style.height = "180px";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(3, 1fr)";
    container.style.gridTemplateRows = "repeat(3, 1fr)";
    container.style.alignItems = "center";
    container.style.justifyItems = "center";
    container.style.pointerEvents = "auto";
    container.style.touchAction = "none";
    container.style.zIndex = "9999";
    container.style.userSelect = "none";

    const buttons = [
        { id: "dpad-up", label: "Move Up", keyCode: KEY_CODES.up, imageFile: "dpad_element_north.png", gridArea: "1 / 2 / 2 / 3" },
        { id: "dpad-left", label: "Move Left", keyCode: KEY_CODES.left, imageFile: "dpad_element_west.png", gridArea: "2 / 1 / 3 / 2" },
        { id: "dpad-right", label: "Move Right", keyCode: KEY_CODES.right, imageFile: "dpad_element_east.png", gridArea: "2 / 3 / 3 / 4" },
        { id: "dpad-down", label: "Move Down", keyCode: KEY_CODES.down, imageFile: "dpad_element_south.png", gridArea: "3 / 2 / 4 / 3" },
    ];

    buttons.forEach((config) => {
        container.appendChild(createTouchButton(config));
    });

    document.body.appendChild(container);
};

/**
 * Build and mount the right-side ABXY cluster for action / cancel inputs.
 * A and X trigger the action key; B and Y trigger the cancel key.
 */
const mountABXY = () => {
    if (document.getElementById(ABXY_ID)) {
        return;
    }
    const container = document.createElement("div");
    container.id = ABXY_ID;
    container.style.position = "fixed";
    container.style.right = "4vw";
    container.style.bottom = "14vh";
    container.style.width = "180px";
    container.style.height = "180px";
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(3, 1fr)";
    container.style.gridTemplateRows = "repeat(3, 1fr)";
    container.style.alignItems = "center";
    container.style.justifyItems = "center";
    container.style.pointerEvents = "auto";
    container.style.touchAction = "none";
    container.style.zIndex = "9999";
    container.style.userSelect = "none";

    const buttons = [
        { id: "button-y", label: "Cancel (Y)", keyCode: KEY_CODES.buttonY, imageFile: "icon_button_y.png", gridArea: "1 / 2 / 2 / 3" },
        { id: "button-x", label: "Action (X)", keyCode: KEY_CODES.buttonX, imageFile: "icon_button_x.png", gridArea: "2 / 1 / 3 / 2" },
        { id: "button-b", label: "Cancel (B)", keyCode: KEY_CODES.cancel, imageFile: "icon_button_b.png", gridArea: "2 / 3 / 3 / 4" },
        { id: "button-a", label: "Action (A)", keyCode: KEY_CODES.action, imageFile: "icon_button_a.png", gridArea: "3 / 2 / 4 / 3" },
    ];

    buttons.forEach((config) => {
        container.appendChild(createTouchButton(config));
    });

    document.body.appendChild(container);
};

/**
 * Ensure any stray pointers that release outside the touch button area still
 * clean up their associated key state.
 */
const installGlobalPointerListener = () => {
    document.addEventListener("pointerup", (event) => {
        const keyCode = pointerToKey.get(event.pointerId);
        if (typeof keyCode === "number") {
            pointerToKey.delete(event.pointerId);
            releaseKey(keyCode);
        }
    }, { passive: false });
};

/**
 * Kick-off rendering once the DOM is ready, regardless of whether the plugin
 * loads before or after the document is interactive.
 */
const activateMobileControls = () => {
    if (!showGamepad) {
        return;
    }
    mountDPad();
    mountABXY();
    installGlobalPointerListener();
};

if (document.readyState === "complete" || document.readyState === "interactive") {
    activateMobileControls();
}
else {
    window.addEventListener("DOMContentLoaded", () => {
        activateMobileControls();
    }, { once: true });
}

export { pluginName, inject };
