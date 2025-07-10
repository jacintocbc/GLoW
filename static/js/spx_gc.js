// ***************************************
// Client javascript for SPX
// ***************************************
// (c) 2020-2024 SPX Graphics
// ***************************************

var socket = io();

// Global App State
let APPSTATE = "INIT";  // see AppState()
let sortable = "";      // a global sortable object so can be disabled at will, see spxinit()
let messageSliderOutTimer // a global var for message slider timeout
document.onkeydown = checkKey;

socket.on('connect', function () {
    // Added in 1.1.0:
    if (document.getElementById('logo') && document.getElementById('logo_off')) {
        document.getElementById('logo').src = document.getElementById('logo_on').src;
        document.body.style = "pointer-events: auto;" // restore clickability
        hideMessageSlider();
    }
}); // end connect

socket.on('SPXMessage2Extension', function (data) {
    // Handles messages coming from server to an extension.
    // All SPX extensions must have 3 tags in their HTML:
    //
    //  <script src="/js/socket.io.js"></script>
    //  <script>var socket = io();</script>
    //  <script src="/js/spx_gc.js"></script>
    //
    // Also if the extension JS code is a module the
    // functions will need to be exposed to the window scope.
    // This is done by adding the following line to the end
    // of the module:
    //
    //  window.functionName = functionName;
    //
    if (typeof window[data.function] === "function") {
        // console.log('API invokeExtensionFunction called --> ' + data.function + '(' + data.params + ')');
        window[data.function](data.params);
    } else {
        console.error('Function not found in extension [' + data.function + ']. Is it exposed?');
    }

}); // end SPXMessage2Extension

socket.on('SPXMessage2Client', function (data) {
    // Handles messages coming from server to this client.
    // All comms using 'SPXMessage2Client' as a conduit with data object and
    // data.spxcmd as function identifier. Additional object values are payload.
    // console.log('SPXMessage2Client received', data)
    switch (data.spxcmd) {
        case 'notifyMultipleControllers':
            let notification = document.getElementById('severalDetected');
            if (notification) { // controller view
                if (data.count && data.count > 1) {
                    console.log(data.count + ' SPX Controllers detected by the server. Displaying notification.');
                    notification.style.display = 'flex';
                } else {
                    notification.style.display = 'none';
                }
            }
            break;

        case 'updateServerIndicator':
            e = document.getElementById(data.indicator);
            if (e) { e.style.color = data.color; }
            break;

        case 'updateStatusText':
            if (document.getElementById('statusbar')) {
                document.getElementById('statusbar').innerText = data.status;
                clearTimeout(localStorage.getItem('SPX_CT_StatusTimer'));
                statusTimer = setTimeout(function () { document.getElementById('statusbar').innerText = ''; }, 3000);
                localStorage.setItem('SPX_CT_StatusTimer', statusTimer);
            } else {
                console.log('statusbar (element) not found');
            }
            break;

        case 'showMessageSlider':
            // Shows a message in the message slider, an extension may initiate this.
            showMessageSlider(data.msg, data.type, data.persist);
            // clearTimeout(localStorage.getItem('SPX_CT_StatusTimer'));
            // statusTimer = setTimeout(function () { document.getElementById('statusbar').innerText = ''; }, 3000);
            // localStorage.setItem('SPX_CT_StatusTimer', statusTimer);
            break;

        case 'clientLostNotification':
            switch (data.clientName) {
                case 'SPX_PROGRAM':
                    if (document.getElementById('toggleRendererWindowProgram')) {
                        console.log('SPX_PROGRAM client lost, toggling off');
                        document.getElementById('toggleRendererWindowProgram').checked = false;
                    } else {
                        console.log('SPX_PROGRAM client lost, no toggle found');
                    }
                    toggleNormalRenderer('normal');
                    break;

                case 'SPX_PREVIEW':
                    if (document.getElementById('toggleRendererWindowPreview')) {
                        console.log('SPX_PREVIEW client lost, toggling off');
                        document.getElementById('toggleRendererWindowPreview').checked = false;
                    } else {
                        console.log('SPX_PREVIEW client lost, no toggle found');
                    }
                    break;

                default:
                    break;
            }
            break;

        default:
        // console.log('Unknown SPXMessage2Client command: ' + data.command);
    }
}); // end SPXMessage2Client

socket.on('SPXMessage2Controller', function (data) {

    // Handles (API) messages coming from server to the SPX-GC Controller.
    // All comms using 'SPXMessage2Controller' as a conduit with data object and
    // data.APIcmd as function identifier. Additional object values are payload.
    // Feature added in v.1.0.8.

    let el = null;
    let DomItemID;
    switch (data.APIcmd) {

        // Rundown commands below

        case 'RundownLoad':
            window.location.href = '/gc/' + data.file
            break;

        case 'RundownFocusFirst':
            focusRow(0)
            break;

        case 'RundownFocusNext':
            moveFocus(1)
            break;

        case 'RundownFocusPrevious':
            moveFocus(-1)
            break;

        case 'RundownFocusLast':
            let lastIndex = document.querySelectorAll('.itemrow').length - 1;
            focusRow(lastIndex)
            break;

        case 'RundownFocusByID':
            focusRow(getElementByEpoch(data.itemID))
            break;

        case 'RundownStopAll':
            stopAll()
            break;

        case 'RundownAllStatesToStopped':
            // console.log('Turn lights off and set DOM variables. Storage handled separately.')
            let items = document.querySelectorAll('.itemrow');
            items.forEach((item, index) => {
                item.setAttribute('data-spx-onair', 'false');
            });
            break;


        // Item commands below

        case 'ItemPlay':
            playItem(getFocusedRow(), 'play')
            break;

        case 'ItemPlayID':
            el = getElementByEpoch(data.itemID);
            if (el) {
                // console.log('ItemPlayID: Element found', data.itemID, el);
                playItem(el, 'play')
            } else {
                console.warn('ItemPlayID: Element not found', data.itemID);
            }
            break;

        case 'ItemContinue':
            // nextItem(getFocusedRow())
            parseRundown(savedRundown);
            break;

        case 'ItemContinueID':
            el = getElementByEpoch(data.itemID);
            if (el) {
                nextItem(el)
            } else {
                console.warn('ItemContinueID: Element not found', data.itemID);
            }
            break;

        case 'ItemStop':
            playItem(getFocusedRow(), 'stop')
            break;

        case 'ItemStopID':
            el = getElementByEpoch(data.itemID);
            if (el) {
                playItem(el, 'stop')
            } else {
                console.warn('ItemStopID: Element not found', data.itemID);
            }
            break;

        // Utils
        case 'showMessageSlider':
            showMessageSlider(data.msg, data.type, data.persist)
            break;

        default:
            console.log('Unknown SPXMessage2Controller command: ' + data.APIcmd, data);
    }
}); // end SPXMessage2Controller

socket.on('refresh', function () {
    window.location.reload();

}); // end Refresh

socket.on('disconnect', function () {
    // Added in 1.1.0
    if (document.getElementById('logo') && document.getElementById('logo_off')) {
        document.getElementById('logo').src = document.getElementById('logo_off').src;
        showMessageSlider('Disconnected from SPX server', type = 'error', true)
        document.body.style = "pointer-events: none;"  // disable clickability
    }
}); // end disconnect

// see also spxInit()
// ##########################################################################################################


function rundownPopup(mode) {
    // get current url
    let url = window.location.href;
    url = url + '/light'
    window.open(url);
}




function Test(routine) {
    // execute a test function on the server
    // this gets triggered by menu > ping
    let data = {};
    switch (routine) {
        case 'A':
            data.spxcmd = 'loadTemplate';
            data.layer = '10';
            data.template = 'spxtestgrid.html';
            socket.emit('SPXWebRendererMessage', data);
            break;

        case 'B':
            data.spxcmd = 'playTemplate';
            data.layer = '10';
            socket.emit('SPXWebRendererMessage', data);
            break;

        case 'C':
            data.spxcmd = 'stopTemplate';
            data.layer = '10';
            socket.emit('SPXWebRendererMessage', data);
            break;


        default:
            console.log('Uknown Test', routine);
    }
}




function tip(msg) {
    // request ..... 
    // returns ..... 
    // Describe the function here 
    e = document.getElementById('statusbar') || null;
    if (e) {
        document.getElementById('statusbar').innerText = msg;
        event.stopPropagation();
        // playServerAudio('beep', 'We are in TIP function');
    }
} // tip mgsed



// -------------- ABC from this onwards



function addSelectedTemplate(idx) {
    // alert('Selected index ' + idx);
    data = {};
    data.command = "addItemToRundown";
    data.foldername = document.getElementById('foldername').value;
    data.listname = document.getElementById('filebasename').value;
    data.datafile = document.getElementById('datafile').value;
    data.templateindex = idx;
    post('', data, 'post');
} // addSelectedTemplate

function addAllTemplatesToRundown() {
    // Added in 1.2.0
    data = {};
    data.command = "addAllItemsToRundown";
    data.foldername = document.getElementById('foldername').value;
    data.listname = document.getElementById('filebasename').value;
    data.datafile = document.getElementById('datafile').value;
    post('', data, 'post');
} // addAllTemplatesToRundown

function ajaxpost(urlPath, data, prepopulated = 'false') {
    // This is a utility function using Axios to POST
    // stuff to server. Here we handle response and 
    // status bar etc...
    // 
    // Prepopulated -flag prevents reading content
    // from json files and submits values as-is; 
    // this is used by show- and global extras.

    if (prepopulated == 'true') {
        // console.log('Prepop YES');
        data.prepopulated = "true"
    } else {
        // console.log('Prepop NO');
        data.prepopulated = "false"
    };

    axios.post(urlPath, data)
        .then(function (response) {
            statusbar(response.data);
            working('');
        })
        .catch(function (error) {
            working('');
            if (error.response) {
                // statusbar('SPX server returned error, see console and logs','error')
                statusbar(error.response.data, 'error')
                showMessageSlider(error.response.data, 'error')
                // msg, type='info', persist=false
                console.log(error.response.data);
                console.log(error.response.status);
                console.log(error.response.headers);
            } else if (error.request) {
                statusbar('SPX server connection error', 'error')
                console.log(error.request);
            } else {
                // Something happened in setting up the request that triggered an Error
                statusbar('SPX request error, see console', 'warn')
                console.log('Error', error.message);
            }
            console.log(error.config);
        });
} // ajaxpost ended

function ajaxpostform(urlPath, FormNro) {
} // ajaxpostform ended

function aFunctionTest() {
    // execute a test function on the server
    // this gets triggered by menu > ping
    console.log('Sending testfunction request to server. See server console / log with PING -identifier...')
    AJAXGET('/CCG/testfunction/');
} //aFunctionTest

// Filename validation for project/ruindown prompts
// Added in 1.3.0
var isValid = (function () {
    var rg1 = /^[^\\/:\*\?"<>\|]+$/; // forbidden characters \ / : * ? " < > |
    var rg2 = /^\./; // cannot start with dot (.)
    var rg3 = /^\_/; // cannot start with underscore (_)
    var rg4 = /^(nul|prn|con|lpt[0-9]|com[0-9])(\.|$)/i; // forbidden file names
    return function isValid(str) {
        return rg1.test(str) && !rg2.test(str) && !rg3.test(str) && !rg3.test(str);
    }
})();


function add() {
    // require ..... nothing
    // returns ..... posts a name of a file to server which redirects
    // Improved in 1.3.0 with validation

    var rundownName
    while (true) {
        rundownName = prompt("Creating a new rundown. Name?").trim();
        if (isValid(rundownName)) {
            break;
        } else {
            alert("Please enter a valid file name, no special characters.");
        }
    }
    if (rundownName != null && rundownName != "") {
        post('', { filebasename: rundownName }, 'post');
    }
} //add


function addshow() {
    // require ..... nothing
    // returns ..... posts a name of a folder to server which redirects
    // Improved in 1.3.0 with validation

    var projectName
    while (true) {
        projectName = prompt("Creating a new project. Name?").trim();
        if (isValid(projectName)) {
            break;
        } else {
            alert("Please enter a valid folder name, no special characters.");
        }
    }
    if (projectName != null && projectName != "") {
        post('', { foldername: projectName }, 'post');
    }

} // addshow

async function AJAXGET(URL) {
    // Sends a GET request to server.
    // Async keyword added in 1.0.15.
    // require ..... URL (such as '/CCG/testfunction/' )
    // returns ..... true/false based on HTTP status codes, such as
    //               200 OK
    //               409 Conflict
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            if (this.responseText) {
                // console.log('AJAX completed succesfully: ' + this.responseText)
                return true
            }
        }
        if (this.readyState == 4 && this.status != 200) {
            console.log('Ajax error, status: ' + this.status + ', state: ' + this.readyState);
            return false
        }
    };
    xmlhttp.open("GET", URL);
    xmlhttp.send();
} // AJAXGET ended

function applyTextEditChanges(event, e) {
    // end editing a TG field
    setMasterButtonStates(e.closest('.itemrow'));
    if (APPSTATE != "EDITING") {
        return;
    }
    if (event.keyCode == 13 || event.which == 13) { // 13 = enter key
        ToggleExpand();
    }
} // applyTextEditChanges

function AppState(NewState) {
    // **********************************************************************
    //
    // Options for global application state. This can be utilized
    // by several function around the application. You can use APPSTATE
    // statement in devtools to see the currently active state...
    // 
    //      Usage: AppState('DEFAULT');
    //
    //      AppState('DEFAULT');    // ......... nothing special
    //      AppState('INIT');       // ......... initialization of the page
    //      AppState('EDITING');    // ......... editing a text field (allow spaces)
    //
    // console.log('Old state: ' + APPSTATE, 'New state: ' + NewState);

    // disable sorting while editing:
    if (NewState == 'EDITING') {
        if (ife('identifier').value == "controller") {
            sortable.option("disabled", true);
        }
    } else {
        if (ife('identifier').value == "controller") {
            sortable.option("disabled", false);
        }
    }
    APPSTATE = NewState;
    //
    // **********************************************************************
} // AppState

function CancelOutTimerIfRunning(CURITEM) {
    // if item has a running timeout attribute, then stop and clear it
    let TimerID = CURITEM.getAttribute('data-spx-timerid') || '';
    if (TimerID) {
        CURITEM.setAttribute('data-spx-timerid', '');
        clearTimeout(TimerID);
        document.getElementById('deleteSmall' + CURITEM.getAttribute('data-spx-index')).style.display = "inline-block";
        document.getElementById('deleteLarge' + CURITEM.getAttribute('data-spx-index')).style.display = "block";
    }
} // CancelOutTimerIfRunning

function cas() {
    // Opens the selected (or current) file in controller.
    // Function works both in Edit and Lists -views.
    // require ..... nothing
    // returns ..... reloads the browser to another URL
    let filename = "";
    let element = "";
    let folder = document.getElementById("hidden_folder").value;
    element = document.getElementById("lists");
    if (typeof (element) != 'undefined' && element != null) {
        filename = element.value;
    }

    element = document.getElementById("filebasename");
    if (typeof (element) != 'undefined' && element != null) {
        filename = element.value;
    }
    if (!filename) { return }
    document.location = '/gc/' + folder + "/" + filename;
} // cas ended

function cfg() {
    // Show settings
    // Called from Settings button in episodes page.
    let foldname = document.getElementById("hidden_folder").value;
    document.location = '/show/' + foldname + "/config";
} // del ended

function checkAllConnections() {
    // require ..... nothing
    // returns ..... forces server to check for CCG connections and pushes updates to indicators via socket.io
    function aFunctionTest() {
        // execute a test function on the server
        AJAXGET('/CCG/testfunction/');
    }
} //checkAllConnections

function checkKey(e) {
    // require ..... keyboard event
    // returns ..... executes keyboard shortcuts, such as applies "Return" to a text field while editing.
    // keybord shortcuts (see https://keycode.info/)

    // TODO: Add your desired keyboard shortcut functions here.

    e = e || window.event;

    // console.log('--- ' + e.keyCode + ' --- ' + APPSTATE);

    // If key pressed not on number pad
    if (e.location < 3) {
        // FIRST GENERIC keycodes for all situations
        switch (e.keyCode) {
            case 116: // F5
                updateItem();
                e.preventDefault(); // do not refresh browser
                return;
                break;

            case 112: // F1
                if (document.getElementById('overlayHelp')) {
                    ModalOn('overlayHelp'); // only valid in Controller view.
                    e.preventDefault(); // do not open built-in help
                }
                return;
                break;

            case 83: // s and S
                if (e.shiftKey && e.ctrlKey) {
                    // Shift+S
                    sortRundown(); // Replace with your actual sort function
                    e.preventDefault(); // Prevent the default action
                }
                return;
                break;

            case 68: // d and D
                if (e.ctrlKey) {
                    e.preventDefault(); // do use add to bookmarks
                    if (document.getElementById('filebasename')) {
                        // Ctrl+D and we are in controller
                        duplicateRundownItem();
                    }
                }
                return;
                break;
        }


        // THEN APPSTATE dependent keycodes
        switch (APPSTATE) {
            // EDITING (while editor open)
            case "EDITING":
                // console.log('Captured keypress while editing');    
                switch (e.keyCode) {
                    case 13: // enter
                        if (document.activeElement.nodeName === "TEXTAREA" && document.hasFocus()) {
                            // console.log('Come on, we are multilining here');
                            return;
                        }
                        saveTemplateItemChangesByElement(getFocusedRow());
                        // saveTemplateItemChanges(getElementIdOfFocusedItem()) // this includes toggle to close it
                        e.preventDefault();
                        break;

                    case 27: // esc
                        if (document.getElementById('filebasename')) {
                            // we are editing
                            ToggleExpand();
                        }

                    case 82: // r and R
                        if (e.shiftKey && e.ctrlKey) {
                            // Ctrl+Shift+R
                            resetToOriginalValues(); // Replace with your actual function
                            e.preventDefault(); // Prevent the default action
                        }
                        return;
                        break;

                    default: // any other key
                        if (document.querySelector('.inFocus')) {
                            document.querySelector('.inFocus').setAttribute("data-spx-changed", "true");
                        }
                        break;
                }
                return;
                break;

            case "INIT":
                return;
                break;


            // OTHER MODES, (while editor closed)
            default:
                // console.log('Captured keypress while NOT editing'); 
                switch (e.keyCode) {
                    case 13: // enter
                        ToggleExpand()
                        e.preventDefault();
                        break;

                    case 32: // space
                        if (e.shiftKey) {
                            // Shift + Space = NEXT
                            nextItem();
                        } else {
                            // Space = PLAY
                            // Bug fix added in 1.1.1. Dblcheck if we are opened...
                            if (getFocusedRow().querySelector('#Expanded').style.display != "none") {
                                // console.log('Ignoring play while opened for editing');
                                return;
                            }
                            playItem();
                        }

                        e.preventDefault();
                        break;

                    case 38: // up
                        moveFocus(-1);
                        break;

                    case 40: // down
                        moveFocus(1);
                        break;

                    case 27: // esc
                        if (document.getElementById('filebasename')) {
                            // we are in controller
                            stopAll(); // STOP all layers used by current rundown
                        }

                    case 83: // s and S
                        if (e.shiftKey && e.ctrlKey) {
                            // Ctrl+Shift+S
                            sortRundown(); // Replace with your actual sort function
                            e.preventDefault(); // Prevent the default action
                        }
                        break;

                    case 116: // F5
                        updateItem();
                        e.preventDefault(); // do not refresh browser
                        break;

                    case 20: // CapsLock
                        if (e.getModifierState("CapsLock")) {
                            showItemIDs(true);
                        } else {
                            showItemIDs(false);
                        }
                        break;
                }
                break;
        }
        // setTimeout(function(){ 
        //     setMasterButtonStates(document.querySelector('.inFocus').getAttribute('data-spx-index'),'from checkKey');
        //     }, 20);
    }

    return;
} //checkKey

function clearAttributes(attName, attValue) {
    // This is called from TGbuttonAction when TG Play button is
    // pressed. This clears all found attName/attValues which
    // forces the play/stop panel to show up upon focus.
    // require ..... attribute name ("data-name") and value ("jack") to search for clearing
    // returns ..... removes green arrow from TG list DOM
    let TGrows = document.querySelectorAll('.itemrow');
    TGrows.forEach(function (item) {
        if (item.getAttribute(attName) == attValue) {
            item.setAttribute(attName, '');
            item.querySelector("#dragIcon").innerHTML = "&#9776"; // drag icon
            item.querySelector("#dragIcon").classList.remove("green");
        }
    })
} // clearAttributes ended

function copyItemID(itemID, api = '') {
    let currentHost = location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : '');
    let str = itemID;
    let inf = 'itemID';
    switch (api.toUpperCase()) {
        case 'PLAY':
            str = currentHost + '/api/v1/item/play/' + itemID;
            inf = 'API play command'
            break;

        case 'STOP':
            str = currentHost + '/api/v1/item/stop/' + itemID;
            inf = 'API stop command'
            break;

        case 'CONTINUE':
            str = currentHost + '/api/v1/item/continue/' + itemID;
            inf = 'API continue command'
            break;

        default:
            break;

    }
    copyText(str);
    showMessageSlider('Copied ' + inf + ' to clipboard', 'happy');
    showItemIDs(false)
} // copyItemID

// function toggleLRendererHandler(slider, targ) {
//     let Cfgdata = {};
//     Cfgdata.key = 'disableLocalRenderer'
//     if (slider.checked) {
//         document.getElementById(targ).innerText = 'YES';
//         document.getElementById('previewIF').src = '/templates/empty.html';
//         document.getElementById('LocalRendererDisabledNotification').style.opacity = 1;
//         Cfgdata.val = true;

//     } else {
//         document.getElementById('previewIF').src = '/renderer';
//         document.getElementById(targ).innerText = 'NO';
//         document.getElementById('LocalRendererDisabledNotification').style.opacity = 0;
//         Cfgdata.val = false;
//     }
//     ajaxpost('/gc/saveConfigChanges',Cfgdata);
// }


function toggleSwitchHandler(slider, targ, type) {
    // When program/preview toggle buttons are clicked.
    // console.log('toggleSwitchHandler', slider, targ);
    let data = {}
    data.type = type;
    let handle = slider.querySelector('.vc-handle');
    if (slider.checked) {
        data.command = 'open';
        document.getElementById(targ).innerText = 'ON';
    } else {
        data.command = 'close';
        document.getElementById(targ).innerText = 'OFF';
    }
    handleRendererPopups(data)
} // toggleSwitchHandler

function toggleRundownSettings() {
    // Toggle the rundown settings panel
    let optionsZone = document.getElementById('rdOptionsCollapsible');
    if (optionsZone.style.maxHeight) {
        optionsZone.style.maxHeight = null;
        setTimeout(function () { optionsZone.style.display = 'none'; }, 300);
    } else {
        optionsZone.style.display = 'block';
        optionsZone.style.maxHeight = optionsZone.scrollHeight + "px";
    }
} // toggleRundownSettings

function toggleLineupSettings() {
    // Toggle the rundown settings panel
    let optionsZone = document.getElementById('lineupOptionsCollapsible');
    if (optionsZone.style.maxHeight) {
        optionsZone.style.maxHeight = null;
        setTimeout(function () { optionsZone.style.display = 'none'; }, 300);
    } else {
        optionsZone.style.display = 'block';
        optionsZone.style.maxHeight = optionsZone.scrollHeight + "px";
    }
} // toggleLineupSettings

function toggleTip(targetField, source, attr) {
    document.getElementById(targetField).innerText = source.getAttribute(attr);
} // toggleTip


function toggleActive(ServerName = '') {
    // Will enable / disable commands to the server
    // CCG/disable {server:'OVERLAY, disable:false}
    let e = document.getElementById('server' + ServerName);
    let targetState = false;
    if (e && e.classList.contains('disabledServer')) {
        // Enable
        e.classList.remove('disabledServer')
        targetState = false
    } else {
        // Disable
        e.classList.add('disabledServer')
        targetState = true
    }

    let data = {};
    data.server = ServerName;
    data.disabled = targetState;
    working('Changing server connection state to [' + targetState + ']...');
    ajaxpost('/CCG/disable', data);
}

function clearUsedChannels(ServerName = '') {
    // Will call a command over API which will clear passed
    // server or all by default.
    clearAllTimeouts();
    console.log('Clear All');
    let data = {};
    data.server = ServerName;
    data.foldername = document.getElementById('foldername').value;
    data.datafile = document.getElementById('datafile').value;
    let ITEMS = document.querySelectorAll('.itemrow');
    ITEMS.forEach(function (templateItem, itemNro) {
        setTimeout(function () {
            // continueUpdateStop('stop', templateItem); // slower
            playItem(templateItem, 'stop');
            // setItemButtonStates(templateItem, 'stop') // just the UI
        }, (itemNro * 40)); // 20, 40, 60, 80ms etc...
    });
    working('Clearing ALL graphic channels used by program [' + data.foldername + ']...');
    ajaxpost('/gc/clearPlayouts', data);
} //clearUsedChannels

function closePromo() {
    // does just that and stores info to the localStorage so 
    // the same promo will not be show...
    let e = document.getElementById('promo');
    localStorage.setItem('SPX_ClosedPromo', e.getAttribute('data-promo-name'));
    e.style.display = 'none';
}

function CollectJSONFromDOM() {
    // iterate DOM and collect data to an array of objects
    // This is called by SaveNewSortOrder().
    // console.log('Collecting JSON');
    let JSONdata = [];
    let Items = document.querySelectorAll('.itemrow');
    Items.forEach(function (item) {
        var dataname = item.getElementsByTagName("input")[0].value;
        var datatitl = item.getElementsByTagName("input")[1].value;
        var Item = {};
        Item.f0 = dataname;
        Item.f1 = datatitl;
        JSONdata.push(Item)
    })
    // console.log(JSONdata);
    return JSONdata;
} // CollectJSONFromDOM ended

function continueUpdateStop(command, itemrow = '') {
    // request ..... command, itemrow (optional)
    // returns ..... ajax response
    // This is being called (at least) from custom-functions...
    if (!itemrow) { itemrow = getFocusedRow(); }
    switch (command) {
        case 'stop':
            // console.log('Stopping item', itemrow);
            playItem(itemrow, 'stop');
            break;

        case 'continue':
            console.log('------continue not implemented-----');
            break;

        case 'update':
            console.log('------update not implemented-----');
            break;

        default:
            console.log('Unknown command [' + command + ']');
            break;
    }
} // ContinueUpdateStop() ended

// async function revealItemID(button) {
//     let item = button.closest('.itemrow')
//     let ID = item.getAttribute('data-spx-epoch');
//     copyText(ID)
//     // alert("Item ID " + ID + " was copied to clipboard.");
//     var newID = prompt("Item ID " + ID + " was copied to clipboard.\nYou can change the ID here:", ID);
//     if (newID != null && newID != ID) {
//         // alert("New ID " + newID)
//         let file = document.getElementById('datafile').value;
//         let URL  = `/api/v1/changeItemID?rundownfile=${file}&ID=${ID}&newID=${newID}`
//         let IDchanged

//         axios.get(URL)
//         .then(function (response) {
//             showMessageSlider('Item renamed to ' + newID + '. Reload recommended.')
//             item.setAttribute('data-spx-epoch', newID);
//             item.querySelector('.copyid').setAttribute('onmouseover', `tip('Copy ID ${newID}')`);
//         })
//         .catch(function (error) {
//             showMessageSlider('Unable to rename. Use unique ID and try again.', 'error')
//         });


//         // if (IDchanged) {
//         //     // success
//         //     item.setAttribute('data-spx-epoch', newID);
//         // } else {
//         //     alert("Unable to change ID to " + newID + " (" + IDchanged + ").\nMake sure the ID is unique and try again.");
//         // }
//     } else {
//         // alert("Same ID " + newID)
//     }
// } // revealItemID

async function changeID(event, element) {
    if (event.location === 3 && event.keyCode === 13) {
        const newID = event.target.value;
        const item = element.closest('.itemrow');
        const ID = item.getAttribute('data-spx-epoch');
        if (newID != null && newID != ID) {
            // alert("New ID " + newID)
            let file = document.getElementById('datafile').value;
            let URL = `/api/v1/changeItemID?rundownfile=${file}&ID=${ID}&newID=${newID}`
            let IDchanged

            axios.get(URL)
                .then(function (response) {
                    console.log(response);
                    showMessageSlider('Item renamed to ' + newID)
                    item.setAttribute('data-spx-epoch', newID);
                    item.querySelector('.copyid').setAttribute('onmouseover', `tip('Copy ID ${newID}')`);
                    const editItem = item.querySelector('.editID');
                    // const outItem = item.querySelector(`input[data-spx-out="${ID}"]`);
                    // outItem.setAttribute('data-spx-out', newID);
                    // const outInput = item.querySelector('.hidden-input-target');
                    editItem.textContent = newID;
                })
                .catch(function (error) {
                    showMessageSlider('Unable to rename. Use unique ID and try again.', 'error')
                    item.setAttribute('data-spx-epoch', ID);
                    item.querySelector('.copyid').setAttribute('onmouseover', `tip('Copy ID ${ID}')`);
                    let editItem = item.querySelector('.editID');
                    editItem.textContent = ID;
                    element.value = ID;
                });
        } else {
            // alert("Same ID " + newID)
        }
    }
}


async function revealItemTiming(button) {
    let curValue = button.textContent;
    let ID = button.closest('.itemrow').getAttribute('data-spx-epoch');
    var newValue = prompt("You can change timing here. Use 'manual', 'none' or millisecond values (1000=1s):", curValue);
    if (newValue != null && newValue != curValue) {
        let file = document.getElementById('datafile').value;
        let URL = `/api/v1/changeItemData?rundownfile=${file}&ID=${ID}&key=out&newValue=${newValue}`
        axios.get(URL)
            .then(function (response) {
                showMessageSlider('Item out mode changed to ' + newValue)
                button.textContent = newValue;
                button.closest('.itemrow').querySelectorAll('input[id^=out]')[0].value = newValue;
            })
            .catch(function (error) {
                showMessageSlider('Unable to change value, please try again.', 'error')
            });
    }
} // revealItemTiming

async function revealItemLayer(button) {
    let curValue = button.textContent;
    let ID = button.closest('.itemrow').getAttribute('data-spx-epoch');
    var newValue = prompt("You can change web playout layer here. Use any value between 1 and 20:", curValue);
    if (newValue != null && newValue != curValue) {
        let file = document.getElementById('datafile').value;
        let URL = `/api/v1/changeItemData?rundownfile=${file}&ID=${ID}&key=webplayout&newValue=${newValue}`
        axios.get(URL)
            .then(function (response) {
                showMessageSlider('Item webplay layer changed to ' + newValue)
                button.textContent = newValue;
                button.closest('.itemrow').querySelectorAll('input[id^=webplayout]')[0].value = newValue;
                // document.querySelectorAll('.itemrow')[0].querySelectorAll('input[id^=out]')[0];
            })
            .catch(function (error) {
                showMessageSlider('Unable to change value, please try again.', 'error')
            });
    }
} // revealItemLayer

function copyRendererUrl(preview = false) {

    let page = '/renderer/';
    if (preview) {
        page = '/renderer?preview=true';
    }
    var RendererUrl = location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : '') + page;
    copyText(RendererUrl);
    showMessageSlider('Copied URL to clipboard', 'happy');
} // copyRendererUrl ended

function copyText(txt) {
    const temp = document.createElement('input');
    document.body.appendChild(temp);
    temp.value = txt;
    temp.select();
    try {
        var successful = document.execCommand('copy');
        var msg = successful ? 'successful' : 'unsuccessful';
        // console.log('Copy command was ' + msg);
    } catch (err) {
        // console.log('Oops, unable to copy');
    }
    temp.parentNode.removeChild(temp);
} // copyText ended

function heartbeat(dd, getOnly = false) { // 36 24 36 hey
    // see notes TDT=00d86114 (/..es2/heartbeat)
    let nw, st, key, val, dif;
    let fD = '|';
    let vD = ':';
    let eK = 'TS'
    let ls = 'SPXGC_UI_stats';
    let or = localStorage.getItem(ls) || eK + vD + "0" + fD + dd + vD + "0";

    if (getOnly) { return or; }

    let ar = or.split(fD);
    let ok = false;
    let rp = false;
    ar.every(function (f, idx) {
        key = f.split(vD)[0]; val = f.split(vD)[1];
        if (key == eK) {
            dif = Math.round((Date.now() - val) / (1000 * 60 * 60 * 24));
            if (Math.round((Date.now() - val) / (1000 * 60 * 60 * 24)) > 0) { rp = true; };
            // ###################
            // rp = true; // debug
            // ###################
            ar[idx] = eK + vD + Date.now();
        }
        if (key == dd) {
            nw = parseInt(val) + 1;
            ar[idx] = key + vD + nw;
            ok = true; return false
        } else {
            ok = false; return true
        }
    });
    if (!ok) { ar.push(dd + vD + '1'); }
    st = ar.join(fD);
    if (rp) {
        // FIXME:
        // console.log('Submit ' + or)
        getMessages2(or)
        st = eK + vD + Date.now() + fD + dd + vD + 1;
    } else {
        // FIXME:
        // console.log('Resume ' + st)
    }
    localStorage.setItem(ls, st)
} // dirty deeds done. 

function del() {
    // Episodes -view
    // Delete a datafile from disk.
    // Called from delete button in lists page.
    var filename = document.getElementById('lists').value;
    if (!filename) { return }
    let foldname = document.getElementById("hidden_folder").value;

    if (confirm('SURE?! Delete "' + filename + '" and all it\'s data?')) {
        fetch('/show/' + foldname + "/" + filename, { method: 'DELETE' });
        setTimeout(function () { document.location = '/show/' + foldname; }, 500);
    }
} // del ended

function delshow() {
    // Shows -view
    // Delete a folder from disk.
    // Called from delete button in shows page.
    // setTimeot - since we do it the AJAX style.
    var foldername = document.getElementById('lists').value;
    if (foldername == "") { return };
    if (confirm('SURE?! Delete "' + foldername + '" and all it\'s data?')) {
        fetch('/shows/' + foldername, { method: 'DELETE' });
        setTimeout(function () { document.location = '/shows'; }, 500);
    }
} // delshow ended

function delRow(e) {
    // console.log('Would delete', e);
    if (!e) { return };
    document.getElementById('itemList').removeChild(e);
    // save data 
    SaveNewSortOrder();
} // delRow ended

function duplicateRundown() {
    // Duplicate a rundown
    data = {};
    let itemName = document.getElementById('lists').value;
    if (!itemName) { return }
    data.filename = itemName + '.json';
    data.foldname = document.getElementById("hidden_folder").value;
    ajaxpost('/gc/duplicateRundown', data);
    setTimeout(function () { document.location = '/show/' + data.foldname; }, 500);
} // duplicateRundown ended

function duplicateRundownItem(rowitem) {
    if (!rowitem) {
        rowitem = getFocusedRow();
    }

    const rowItems = document.querySelectorAll('.itemrow');
    const ID = rowitem.getAttribute('data-spx-epoch');
    const newID = prompt("Item ID " + ID + " was copied to clipboard.\nYou can type the duplicate's new ID here:", ID);

    if (newID != null && newID != ID) {
        let idExists = false;
        for (let i = 0; i < rowItems.length; i++) {
            if (rowItems[i].getAttribute('data-spx-epoch') == newID) {
                idExists = true;
                break;
            }
        }
        if (!idExists) {
            completeDuplicateRundownItem(rowitem, newID)
        } else {
            showMessageSlider('Unable to rename. ID already exists.', 'error');
        }
    } else {
        showMessageSlider('Unable to rename. Use unique ID and try again.', 'error');
    }
}

function completeDuplicateRundownItem(rowitem, newID) {

    // Collect data for the server to duplicating the item
    data = {};
    data.command = "duplicateRundownItem";
    data.sourceEpoch = rowitem.getAttribute('data-spx-epoch');
    data.cloneEpoch = newID // create epoch and give this to server also
    data.foldername = document.getElementById('foldername').value;
    data.listname = document.getElementById('filebasename').value;
    data.datafile = document.getElementById('datafile').value;

    var newItem = rowitem.cloneNode(true);
    newItem.style.opacity = 0;

    // update table id's for sorting to keep up. A bug found right after 1.0.12 was released.
    updateFormIndexes()
    rowitem.after(newItem);

    let list = [
        newItem.setAttribute('data-spx-epoch', data.cloneEpoch),
        newItem.setAttribute('data-spx-onair', "false"),
        newItem.querySelector('.copyid').setAttribute('onmouseover', 'tip("Duplicated item ' + data.cloneEpoch + '")'),
        rowitem.classList.remove('inFocus'),
        newItem.classList.add('inFocus'),
        newItem.querySelector('.editID').textContent = data.cloneEpoch,
        newItem.querySelector('.idInput').value = data.cloneEpoch,
        newItem.style.opacity = 1
    ]

    applyCommands(list);
    working('Sending ' + data.command + ' request.');
    ajaxpost('', data);

    function applyCommands(list) {
        // delay commands utility
        let totalDelay = 0;
        let stepDelay = 10;
        list.forEach((item, index) => {
            totalDelay += stepDelay;
            setTimeout(function () { (item) }, totalDelay);
        });
    }

} // duplicateRundownItem ended

function edi() {
    // Edit a datafile on disk.
    // Called from edit button in lists page.
    var filename = document.getElementById('lists').value;
    document.location = '/shows/' + filename;
} // edi ended

function openRelpathFolder(itemrow) {
    // added in 1.1.1 - Open a file for editing.
    let fileRef = itemrow.querySelector("[id^='relpath']").value;
    AJAXGET('/api/openFileFolder?file=' + fileRef);
} // openRelpathFolder ended

function openLightModePanel() {
    // Open a light mode panel (in Controller only)
    let newUrl = window.location.href + '/light';
    window.open(newUrl, 'SPX-LITE', '_blank, width=680, height=850, scrollbars=yes, location=yes,status=yes');
}

function eps() {
    // Opens the selected (or current) file in controller.
    // Function works both in Edit and Lists -views.
    // require ..... nothing
    // returns ..... reloads the browser to another URL
    let foldername = "";
    let element = "";
    element = document.getElementById("lists");
    if (typeof (element) != 'undefined' && element != null) {
        foldername = element.value;
    }

    element = document.getElementById("filebasename");
    if (typeof (element) != 'undefined' && element != null) {
        foldername = element.value;
    }
    if (foldername == "") { return };
    document.location = '/show/' + foldername;
} // cas ended

function exportItemAsCSV(rowItem) {
    // export an item as a CSV file, which then can be
    // filled in and imported back, so it will auto-generate
    // a bunch of graphics.
    // Added in 1.0.15
    let data = {};
    data.foldername = document.getElementById('foldername').value;
    data.datafile = document.getElementById('filebasename').value;
    data.itemID = rowItem.getAttribute('data-spx-epoch');
    working('Generating CSV file to ASSETS/csv -folder.');
    ajaxpost('/api/exportCSVfile', data);
    showMessageSlider('CSV file generated to ASSETS/csv -folder.')

} // exportItemAsCSV ended

function ModalOn(modalID) {
    // Added in 1.1.4 - reset selections
    var allItems = document.getElementsByClassName("filebrowser_file") || [];
    Array.prototype.forEach.call(allItems, function (el) {
        el.classList.remove('selectedFile')
    });

    if (document.getElementById('allToggle')) {
        document.getElementById('allToggle').innerText = document.getElementById('allToggle').getAttribute('data-all-label');
    }

    document.getElementById(modalID).style.display = "block";
} //FileBrowserOn

function ModalOff(modalID) {
    document.getElementById(modalID).style.display = "none";
} //FileBrowserOff

function openImportDialog() {
    ModalOff('overlayTemplatePicker')
    ModalOn('filebrowserModal')
    // console.log('Opening File browser dialog');
} // openImportDialog

function filterProjects() {
    // Added in 1.1.0 - will hide/show items in the allProjects list
    var input, filterPhrase, projList, li, itemValue, i, txtValue;
    input = document.getElementById('projectFilter');
    filterPhrase = input.value.toUpperCase();
    projList = document.getElementById("allProjects");
    optionItems = projList.getElementsByTagName('option');
    lists.innerHTML = ''; // clear
    for (i = 0; i < optionItems.length; i++) {
        txtValue = optionItems[i].innerText;
        let filters = filterPhrase.split(" ")
        filters = filters.filter(f => f.length)
        let shouldDisplay = true
        filters.forEach(filterItem => {
            shouldDisplay = shouldDisplay && txtValue.toUpperCase().includes(filterItem)
        })
        if (shouldDisplay || filters.length === 0) {
            var opt = document.createElement('option');
            opt.innerHTML = txtValue;
            lists.appendChild(opt);
        }
    }
} // filterProjects ended

function focusRow(rowitemOrIndex) {
    // will make TG item focused and will set masterbutton states.
    // console.log('Focusing', typeof rowitemOrIndex, rowitemOrIndex);

    // clear focus from all rows first
    document.querySelectorAll('.itemrow').forEach(function (item, i) {
        if (item.classList.contains("inFocus")) {
            item.classList.remove('inFocus');
        } else {
            item.setAttribute('data-spx-previewing', 'false'); // added in 1.1.1
        }
    })
    var index = 0; // for master buttons

    let TargetElement = '';
    if (typeof rowitemOrIndex == "number") {
        // console.log('rowitemOrIndex was a number');
        TargetElement = document.querySelectorAll('.itemrow')[rowitemOrIndex];
        index = rowitemOrIndex;
    }

    if (typeof rowitemOrIndex == "object") {
        TargetElement = rowitemOrIndex;
        index = getIndexOfRowItem(rowitemOrIndex);
    }

    if (TargetElement) {
        TargetElement.classList.add('inFocus');
        TargetElement.scrollIntoView({
            behavior: "auto",
            block: "nearest",
        });

        // Added in 1.1.0:
        if (document.getElementById('previewMode').value === 'selected') {
            if (TargetElement.getAttribute('data-spx-previewing') != 'true') {
                TargetElement.setAttribute('data-spx-previewing', 'true'); // added in 1.1.1 to avoid double previewing
                previewItem(); // preview selected item
            }
        }

    }




    setMasterButtonStates(TargetElement, 'from focusRow');
} // focusRow ended

function org_focusRow(index, useID = false) {
    // FIXME: This is archived version of this function.
    // Delete at some point -----------------------------

    // will make TG item focused
    // and will set TG button states.
    // index = target number
    // useID = if true will use index as element ID, otherwise as index

    let TargetElement = '';
    index = Math.max(0, index); // do not allow negative numbers
    let rows = document.querySelectorAll('.itemrow');
    rows.forEach(function (item) {
        let classes = item.classList;
        if (classes.contains("inFocus")) {
            item.classList.remove('inFocus');
        }
    })
    if (useID) {
        // use absolute ID when clicked with mouse
        TargetElement = document.getElementById('playlistitem' + index);
    }
    else {
        // use list index when up / down keys
        TargetElement = document.querySelectorAll('.itemrow')[index];
    }

    // console.log('Focusing to ' + index + ' [use ElementID: ' + useID + '], which is ' + TargetElement.id + ' and scrolling that to view.');
    if (TargetElement) {
        TargetElement.classList.add('inFocus');
        TargetElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center"
        });
    }
    setMasterButtonStates(index, 'from focusRow');
} // focusRow ended

function getElementIdOfFocusedItem() {
    // FIXME: Is this in use? From old logic?
    // a utility to iterate DOM items, return element ID of focused
    for (let nro = 0; nro < document.querySelectorAll('.itemrow').length; nro++) {
        if (document.querySelectorAll('.itemrow')[nro].classList.contains('inFocus')) {
            return getElementIdByDomIndex(nro)
        };
    }
} // getElementIdOfFocusedItem ended

function getFocusedRow() {
    // a utility to iterate DOM rows, returns focused element reference

    return document.querySelectorAll('.inFocus')[0];

    // for (let nro = 0; nro < document.querySelectorAll('.itemrow').length; nro++) {
    //     if (document.querySelectorAll('.itemrow')[nro].classList.contains('inFocus')) {
    //         console.log('Focused row is ' + nro + ' ID: ' + document.querySelectorAll('.itemrow')[nro].getAttribute('data-spx-epoch'));
    //         return document.querySelectorAll('.itemrow')[nro];
    //     };
    // }
} // getFocusedRow ended

function getElementByEpoch(itemID) {
    // get element by epoch id (added in 1.0.8)
    let DomItemID;
    for (let index = 0; index < document.querySelectorAll('.itemrow').length; index++) {
        DomItemID = document.querySelectorAll('.itemrow')[index].getAttribute('data-spx-epoch');
        // console.log('Checking ' + DomItemID + ' against ' + itemID + '...');
        if (DomItemID == itemID) {
            return document.querySelectorAll('.itemrow')[index]
        };
    }
    return false; // added in 1.2.0
} // getElementByEpoch ended


function getIndexOfRowItem(rowitem) {
    // Utility, gets a row element and returns it's index
    document.querySelectorAll('.itemrow').forEach(function (item, i) {
        if (rowitem = item) {
            return i;
        }
    })
} // getIndexOfRowItem ended

function getElementIdByDomIndex(domIndex) {
    // FIXME: Is this in use? From old logic?
    // A utility to iterate all DOM items and return ID of element at itemIndex.
    // request = dom index number
    // returns = ElementID number

    let ElementFullID = document.querySelectorAll('.itemrow')[domIndex].id;
    let JustElementID = ElementFullID.replace('playlistitem', '');
    return JustElementID
} // getElementIdByDomIndex ended

function getDomIndexByElementId(ElementId) {
    // FIXME: Is this in use? From old logic?
    // A utility to iterate all DOM items and return dom index of given ElementId
    // Tested, this seem to work :)
    // request = ElementID
    // returns = dom index of the given ElementID

    for (let DomNro = 0; DomNro < document.querySelectorAll('.itemrow').length; DomNro++) {
        if (document.querySelectorAll('.itemrow')[DomNro].id == 'playlistitem' + String(ElementId)) {
            // console.log('Found DomIndex ' + DomNro + ' for ElementID ' + String(ElementId) + '.');
            return DomNro
        };
    }
} // getDomIndexByElementId ended

function getLayerFromProfile(buttonName) {
    // Make JSON from profiledata string from a hidden field and search it...
    // console.log('Searching layer for ' + buttonName);
    // This is a utility which is called bu Vue when checking button states.
    let profiledata = JSON.parse(document.getElementById('profiledata').value);
    let prfName = document.getElementById('profname').innerText.toUpperCase();
    for (var i = 0; i < profiledata.profiles.length; i++) {
        let curName = profiledata.profiles[i].name.toUpperCase();
        if (curName == prfName) {
            let SRV = profiledata.profiles[i].templates[buttonName].server;
            let CHA = profiledata.profiles[i].templates[buttonName].channel;
            let LAY = profiledata.profiles[i].templates[buttonName].layer;
            let CCG = SRV + " " + CHA + " " + LAY;
            // console.log("Render layer of [" + buttonName + "] in profile [" + prfName + "] is [" + CCG + "].");
            return CCG;
        }
    }
} // getLayerFromProfile ended

function getMessages(curVerInfo) {
    // Poll server for upgrade info. ------------------------------
    // Requires CORS in the route.
    // Moved from view-home.
    //
    // PLEASE NOTE: This will be replaced with improved mechanism
    //              which will report usage stats also and will
    //              notify user with a small icon to reveal the
    //              promo within controller UI. 
    //              This will happen in 1.1.x.
    //
    //              All passed data is anonymous and non-identifiable
    // -------------------------------------------------------------


    let versionStr = curVerInfo.split('v=')[1].split('&')[0].trim();
    // console.log('getMessages [' + versionStr + ']', curVerInfo);

    localStorage.removeItem('SPX-GC-NewVersion');
    document.getElementById('upgradeinfo').style.display = "none";
    document.getElementById('messageinfo').style.display = "none";
    var url = (`https://www.smartpx.fi/gc/messageservice/?` + curVerInfo);
    fetch(url)
        .then((res) => res.json())
        .then((messages) => {
            let currntVer = document.getElementById('footerVerDisplay').innerText;
            let latestVer = messages.latest.vers;
            let dbggreet = messages.dbggreet || "";

            // this has been broken until 1.0.11
            let debugNotifications = false;
            if (document.getElementById('greeting') && document.getElementById('greeting').innerText != '') {
                if (dbggreet == document.getElementById('greeting').innerText) {
                    // if config.greeting == message.greeting then debug it!
                    debugNotifications = true;
                }
            }

            if (messages.latest.vers && versInt(latestVer) > versInt(currntVer) || debugNotifications) {
                // Yes, there is new version available
                localStorage.setItem('SPX-GC-NewVersion', latestVer);
                document.getElementById('upgradeinfo').style.display = "block";
                document.getElementById('upgrade_date').innerText = messages.latest.date;
                document.getElementById('upgrade_head').innerText = messages.latest.head;
                document.getElementById('upgrade_body').innerText = messages.latest.body;
                document.getElementById('upgrade_call').innerText = messages.latest.call;
                document.getElementById('upgrade_link').href = messages.latest.href;
                document.getElementById('upgrade_link').innerText = messages.latest.link;
            }

            if (messages.notification.type && messages.notification.type != "none" || debugNotifications) {
                // Yes, there is something else to announce
                document.getElementById('messageinfo').style.display = "block";
                document.getElementById('messageinfo').classList = "message-" + messages.notification.type;
                document.getElementById('messagelink').classList = "message-" + messages.notification.type;
                document.getElementById('message_date').innerText = messages.notification.date;
                document.getElementById('message_head').innerText = messages.notification.head;
                document.getElementById('message_body').innerText = messages.notification.body;
                document.getElementById('message_call').innerText = messages.notification.call;
                document.getElementById('message_link').href = messages.notification.href;
                document.getElementById('message_link').innerText = messages.notification.link;
            }

            // Added in 1.1.2
            // versionStr = "1.0.0"; // DEBUG## with specific version number
            if (messages.homepagepromo[versionStr]) {
                // console.log('Promo available for v.' + versionStr, messages.homepagepromo[versionStr]);
                document.getElementById('homepagepromolink').href = messages.homepagepromo[versionStr].link;
                document.getElementById('homepagepromopict').src = messages.homepagepromo[versionStr].pict;
                document.getElementById('homepagepromopict').title = messages.homepagepromo[versionStr].titl;
            } else {
                // Check if there is a default promo
                if (messages.homepagepromo && messages.homepagepromo.default && messages.homepagepromo.default.active) {
                    // console.log('Using active default promo.', messages.homepagepromo.default);
                    document.getElementById('homepagepromolink').href = messages.homepagepromo.default.link;
                    document.getElementById('homepagepromopict').src = messages.homepagepromo.default.pict;
                    document.getElementById('homepagepromopict').title = messages.homepagepromo.default.titl;
                }
            }
        })
        .catch((error) => {
            console.error('SPX error in getMessages().', error)
        });
} // getMessages ended

function getMessages2(or) {
    // This is called from heartbeat after a day change and will
    // post anonymous usage data and may get potential notification
    // data back to be displayed in the SPX user interface.
    // This function is in early stage in v 1.1.0 and will be
    // fully implemented in future versions.
    ajaxpost('/api/heartbeat', { data: or });
} // getMessages2 ended

function handleRendererPopups(data) {
    // open / close renderer popups 
    // data: {type:preview}
    // Save to config.json general.renderer as "normal" (embedded inline renderer) or "popup" (floating window)

    let URL;
    let socketData = {};
    var w = 1280;
    var h = 720;
    var left = (screen.width / 2) - (w / 2);
    var top = (screen.height / 2) - (h / 2);
    var OPT = '_blank,toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left;

    if (data.type === 'preview') { URL = '/renderwindow/preview'; winRef = 'SPXpreviewWindow' }
    if (data.type === 'program') { URL = '/renderwindow/program'; winRef = 'SPXprogramWindow' }

    if (data.command == 'open') {
        // open the popup
        window.open(URL, winRef, OPT);
    }

    if (data.command == 'close') {
        // send message request to close the popup
        // send message to close the window without prompts (closeprogram closepreview)
        socketData.spxcmd = 'close' + data.type;
        socket.emit('SPXWebRendererMessage', socketData);
    }

    if (data.type == 'program') {
        toggleNormalRenderer(data.command)
    }
} // handleRendererPopups ended

function help(section) {
    // Help is massively a WORK-IN-PROGRESS thing!
    // Wanna help? Let us know.
    // 
    // Open help feature. This is a central location to 
    // handle help links. The 'section' argument is optional
    // and can redirect to desired pages/bookmarks...
    //
    // request ..... section or <empty>
    // returns ..... opens a tab with help content

    let HELP_ROOT = "https://spxgc.tawk.help/"
    let HELP_PAGE = ""
    section = section.toUpperCase()

    switch (section) {
        case "INTRO": HELP_PAGE = "article/help-intro"; break;
        case "PROJECTS": HELP_PAGE = "article/help-dataroot"; break;
        case "PLAYLISTS": HELP_PAGE = "article/help-dataroot"; break;
        case "CONFIG": HELP_PAGE = "article/help-config-general"; break;
        case "WEBPLAYOUT": HELP_PAGE = "article/help-config-renderer"; break;
        case "CASPARCG": HELP_PAGE = "article/help-config-casparcg"; break;
        case "GLOBALEXTRAS": HELP_PAGE = "article/help-config-globalextras"; break;
        case "PROJECTGENERAL": HELP_PAGE = "article/help-project-general"; break;
        case "PROJECTTEMPLATES": HELP_PAGE = "article/help-project-templates"; break;
        case "PROJECTVARIABLES": HELP_PAGE = "article/help-project-variables"; break;
        case "PROJECTEXTRAS": HELP_PAGE = "article/help-project-extras"; break;
        case "CONTROLLER": HELP_PAGE = "article/help-controller"; break;
        case "CSV": HELP_PAGE = "article/help-csv-files"; break;
        case "API": HELP_PAGE = "article/help-api"; break;
        case "ITEM-DETAILS": HELP_PAGE = "article/help-item-details"; break;
        case "SEVERAL": HELP_PAGE = "article/help-several-controllers"; break;
        case "LIGHTMODE": HELP_PAGE = "article/light-mode"; break;
        default: break;
    }

    let FULL_URL = HELP_ROOT + HELP_PAGE;
    window.open(FULL_URL, 'GCHELP', '_blank,width=980,height=800,scrollbars=yes,location=yes,status=yes');
} // help ended

function moveFocus(nro) {
    // Move highlighted row up/down with keyboard commands
    // Request .... nro = negative (-1) or positive (1)
    // Returns .... nothing, just set focus
    let itemCount = document.querySelectorAll('.itemrow').length;
    let curIndex = 0;
    for (let item = 0; item < itemCount; item++) {
        if (document.querySelectorAll('.itemrow')[item].classList.contains('inFocus')) {
            curIndex = item;
        }
    }

    if (nro > 0) {
        // positive, move downwards
        newIndex = curIndex + 1;
        //if (newIndex>itemCount-1){newIndex=0}; // go back to top
        if (newIndex > itemCount - 1) { newIndex = itemCount - 1 }; // stay at the bottom
        focusRow(newIndex);
    }
    if (nro < 0) {
        // negative, move upwards
        newIndex = curIndex - 1;
        //if (newIndex<0){newIndex=itemCount-1}; // go to end of list
        if (newIndex < 0) { newIndex = 0 }; // stay at the top
        focusRow(newIndex);
    }
} // moveFocus ended

function nextItem(itemrow = '') {
    // Next / continue command.

    if (!itemrow) {
        // itemrow not given, get focused row
        itemrow = getFocusedRow();
    }
    data = {};
    data.datafile = document.getElementById('datafile').value;
    data.epoch = itemrow.getAttribute('data-spx-epoch');
    data.command = 'next';
    working('Sending ' + data.command + ' request.');
    ajaxpost('/gc/playout', data);
    heartbeat(304); // identifier

    // decrease steps left
    var stepsleft = parseInt(itemrow.getAttribute('data-spx-stepsleft')) - 1;
    itemrow.setAttribute('data-spx-stepsleft', stepsleft);
    // console.log('Steps left: ' + stepsleft);
    if (stepsleft < 1) {
        // This should go somewhere else - because of DRY.
        // This duplicates some code from playItem
        // itemrow.setAttribute('data-spx-onair', false);
        itemrow.setAttribute('data-spx-stepsleft', itemrow.querySelector('input[name="RundownItem[steps]"]').value); // reset counter
        let uselessReturnValue = setItemButtonStates(itemrow, forcedCommand = 'stop');
        document.getElementById('MasterCONTINUE').classList.add('disabled');
        setMasterButtonStates(itemrow);
    }

    // Check for function_onNext event (added in 1.1.4):
    let onNextField = itemrow.querySelector('[name="RundownItem[function_onNext]"]');
    // console.log('onNextField: ', data.command, onNextField);
    if (onNextField && onNextField.value != "") {
        // console.log('onNextField: ' + onNextField.value);
        let onNextCommand = onNextField.value.split('|') || [];
        // console.log('[' + String(new Date().toLocaleTimeString()) + '] ' + 'NEXT event: ' + onNextCommand);
        let FunctionName = String(onNextCommand[0] || 'noFunctionName').trim();
        let FunctionArgs = String(onNextCommand[1] || 'NoArgs').trim();
        let ExecuteDelay = String(onNextCommand[2] || '100').trim();
        let ConditFField = String(onNextCommand[3] || 'XXX').trim();
        let conditionVal = null;
        let eventCondtFF = itemrow.querySelector('[data-update=' + ConditFField + ']');
        if (eventCondtFF) { conditionVal = eventCondtFF.value; }
        setTimeout(function () {
            // console.log('FunctionName:' + FunctionName);
            window[FunctionName]([FunctionArgs, conditionVal, data.epoch]);
        }, parseInt(ExecuteDelay));
        heartbeat(314); // identifier
    }


} // nextItem

function previewItem(itemrow = '') {
    // Added in 1.1.0
    // console.log('Itemrow: ', itemrow);
    if (!itemrow) { itemrow = getFocusedRow(); }
    if (!itemrow) { /* console.log('No active rows, skip command.');*/ return; }
    itemrow.setAttribute('data-spx-previewing', 'true'); // added in 1.1.1 to avoid double previewing. See also focusRow()
    data = {};
    data.datafile = document.getElementById('datafile').value;
    data.epoch = itemrow.getAttribute('data-spx-epoch') || 0;
    data.command = 'preview'; // added in 1.1.0
    // Need to get correct ID for countdown / confetti
    if (data.epoch !== "84592" && data.epoch !== "11814") {
        working('Sending ' + data.command + ' request.');
        ajaxpost('/gc/playout', data);
        heartbeat(308); // identifier
    }
} // previewItem

function projectSettings() {
    // Open project settings page from rundown list page
    document.location.href += '/config';
} // projectSettings

function playItem(itemrow = '', forcedCommand = '') {
    // Play item toggle.
    //
    // request ..... itemrow
    //               forcedCommand is (for example) to stop item when continue steps are done
    // returns ..... ajax response message to GUI
    //
    // Will send data object with an index and playlist filename
    // and playout handler will parse required data and so on. 
    //
    // FIXME: Bug found 2023-11-07 Step counter in DOM needs to be reset on Play

    if (!itemrow) { itemrow = getFocusedRow(); }
    if (!itemrow) { return; }

    data = {};
    data.datafile = document.getElementById('datafile').value;
    data.epoch = itemrow.getAttribute('data-spx-epoch') || 0;
    data.command = setItemButtonStates(itemrow, forcedCommand);       // update buttons and return command (play/stop/playonce). ForcedCommand (stop) overrides.
    setMasterButtonStates(itemrow, 'from playItem');                        // update master button UI 
    working('Sending ' + data.command + ' request.');
    ajaxpost('/gc/playout', data);

    // Stats
    if (data.command == 'play' || data.command == "playonce") { heartbeat(302) }
    if (data.command == 'continue') { heartbeat(304) }
    if (data.command == 'stop') { heartbeat(306) }

    // playonce (for out type=none) command acts on the server, but the state will not be saved to JSON
    let isPlay = false;
    if (data.command == "play" || data.command == "playonce") {
        isPlay = true;

        // Added in 1.1.0 FIXME: This has some issues, previewing wrong items etc...
        if (document.getElementById('previewMode').value === 'next') {
            console.log('Preview-next-on-play IS WIP and IS CURRENTY DISABLED');

            // TODO: Enable this:
            // let nextRundownItem = getFocusedRow().nextElementSibling;
            // console.log('Next elementID ' + nextRundownItem.id, nextRundownItem);
            // previewItem(nextRundownItem);
        }

    }

    // Check for function_onPlay event (improved in 1.1.4):
    let onPlayField = itemrow.querySelector('[name="RundownItem[function_onPlay]"]');
    if (isPlay && onPlayField && onPlayField.value != "") {

        // TODO: This needs more work! =============================
        // Now this expects an array of 4 values, but function calls
        // can have 0 or several arguments...
        // ========================================================

        // Changed in v1.1.4 (no other server changes, just "spx_gc.js")
        // Examples of valid "function_onPlay/nStop" values:
        // 
        //  myCustomMethod | {'foo': 'bar'} | 500 | f1
        //  myCustomMethod | 'foo'          | 500 | f1
        // 
        //  1st: Function name (no parenthesis),
        //  2nd: an optional JSON object or a string argument,
        //  3rd: execution delay in ms.
        //  4th: one of the f-fields (value can be used as a condition in the function)


        let onPlayCommand = onPlayField.value.split('|') || [];
        let FunctionName = String(onPlayCommand[0] || 'noFunctionName').trim();
        let FunctionArgs = String(onPlayCommand[1] || 'NoArgs').trim();
        let ExecuteDelay = String(onPlayCommand[2] || '100').trim();
        let ConditFField = String(onPlayCommand[3] || 'XXX').trim();
        let conditionVal = null;
        let eventCondtFF = itemrow.querySelector('[data-update=' + ConditFField + ']');

        // Improved in 1.3.0 - now supports also SELECT and CHECKBOX fields
        if (eventCondtFF) {
            switch (eventCondtFF.tagName) {
                case 'SELECT':
                    conditionVal = eventCondtFF.options[eventCondtFF.selectedIndex].value;
                    break;

                case 'INPUT':
                    if (eventCondtFF.type == 'checkbox') {
                        conditionVal = eventCondtFF.checked;
                    } else {
                        conditionVal = eventCondtFF.value;
                    }
                    break;

                default:
                    conditionVal = eventCondtFF.value;
            }
        }

        setTimeout(function () {
            if (window[FunctionName]) {
                window[FunctionName]([FunctionArgs, conditionVal, data.epoch]); // Added data.epoch in 1.1.4
            } else {
                showMessageSlider('Function "' + FunctionName + '" not found in current custom functions library file.', 'warn');
            }
        }, parseInt(ExecuteDelay));
        heartbeat(310); // identifier
    }

    // Check for function_onStop event (improved in 1.1.4):
    let onStopField = itemrow.querySelector('[name="RundownItem[function_onStop]"]');
    if (data.command == "stop" && onStopField && onStopField.value != "") {
        // Changed in v1.1.4 (no other server changes, just "spx_gc.js")
        let onStopCommand = onStopField.value.split('|') || [];
        // console.log('[' + String(new Date().toLocaleTimeString()) + '] ' + 'STOP event: ' + onStopCommand);
        let FunctionName = String(onStopCommand[0] || 'noFunctionName').trim();
        let FunctionArgs = String(onStopCommand[1] || 'NoArgs').trim();
        let ExecuteDelay = String(onStopCommand[2] || '100').trim();
        let ConditFField = String(onStopCommand[3] || 'XXX').trim();
        let conditionVal = null;
        let eventCondtFF = itemrow.querySelector('[data-update=' + ConditFField + ']');
        if (eventCondtFF) { conditionVal = eventCondtFF.value; }
        setTimeout(function () {
            // console.log('FunctionName:' + FunctionName);
            window[FunctionName]([FunctionArgs, conditionVal, data.epoch]);
        }, parseInt(ExecuteDelay));
        heartbeat(312); // identifier
    }

    // Remember, onNext is handled in nextItem();

    // auto-out trigger UI update (FIXME: verify auto-out works over direct API commands?!)
    let TimeoutAsString = itemrow.querySelector('[name="RundownItem[out]"]').value;
    // console.log('TimeoutAsString: ', TimeoutAsString);

    if (!isNaN(TimeoutAsString)) {
        // value is numerical, so
        // console.log('TimeoutAsString is a number, so it is a timeout value.'); 
        if (data.command == "play") {
            // Changed in 1.0.9, failed in 1.0.8.
            // 1.0.12: Fixed looping issue found by Koen.
            let TimeoutAsInt = parseInt(TimeoutAsString);
            // console.log('Will stop playlistitem ' + itemrow.getAttribute('data-spx-epoch') + ' in ' + TimeoutAsInt + 'ms...');
            var AutoOutTimerID = setTimeout(function () {
                if (itemrow.getAttribute('data-spx-onair') === 'true') {
                    playItem(itemrow, 'stop');
                }
            }, TimeoutAsInt);
            itemrow.setAttribute('data-spx-timerid', AutoOutTimerID);
        } else {
            CancelOutTimerIfRunning(itemrow);
        }
    }

} // playItem

function playItemLocal(itemID) {
    // Just play an item to the local Controller preview
    // console.log('Sending playItemLocal request (spx-gc) ' + itemID + ' in 5 secs...');
    data = {};
    data.datafile = document.getElementById('datafile').value;
    data.epoch = itemID || 0;
    data.command = 'autoPlayLocal';
    ajaxpost('/gc/playout', data);
    heartbeat(308)
} // playItemLocal

function renameRundown() {
    // Rename an existing rundown
    // Improved in 1.3.0 with validation
    var filename = document.getElementById('lists').value;
    if (!filename) { return }
    var foldname = document.getElementById("hidden_folder").value;

    while (true) {
        newname = prompt("Rename rundown to?", filename).trim();
        if (isValid(newname)) {
            break;
        } else {
            alert("Please enter a valid file name, no special characters.");
        }
    }
    if (newname != null && newname != "") {
        data = {};
        data.orgname = filename + '.json';
        data.newname = newname;
        data.foldnam = foldname;
        ajaxpost('/gc/renameRundown', data);
        setTimeout(function () { document.location = '/show/' + foldname; }, 300);
    }

} // renameRundown ended

function versInt(semver) {
    // Returns a numeric value representing "1.0.0" formatted semantic version string.
    // This works as long as max value of each field is 99!
    // Moved from view-home in 1.1.0
    let parts = semver.split(".");
    let MajorInt = parseInt(parts[0].trim()) * 100000
    let MinorInt = parseInt(parts[1].trim()) * 1000
    let PatchInt = parseInt(parts[2].trim())
    let versInt = (MajorInt + MinorInt + PatchInt);
    // console.log('Semver ' + semver + ' = versInt ' + versInt);
    return versInt
}

function setItemButtonStates(itemrow, forcedCommand = '') {
    // Utility function which will toggle play indicators in
    // collapsed AND expanded views based on calling element's
    // current state.

    // forcedCommand is used to forcefully stop an item, which steps has run
    // out after continue is done...

    // v.1.0.8 also forced 'play' is being used by API v1 to force
    // play only, not just toggle..

    // 
    // Requests ..... playlistitem's eleIndex nro
    // Response ..... 'play' or 'stop' state after toggle
    // 

    if (itemrow.querySelector('[name="RundownItem[out]"]').value == "none") {
        // console.log('NONE out type in this graphic. Do not set the buttons in any way and return with playonce.');
        if (forcedCommand == 'stop') {
            return 'stop'; // Added in v 1.1.2 to prevent playing bumper at "Stop All"
        }
        return 'playonce';
    }

    let CommandToExecute = 'play' // default action
    let EXPANDEDPLAY = itemrow.querySelector('[data-spx-name="playbutton"]');
    let rows = document.querySelectorAll('.itemrow');


    if (itemrow.getAttribute('data-spx-onair') == "true" || forcedCommand == 'stop') {
        // so, we are playing and needs to stop
        CommandToExecute = 'stop';
    }

    if (itemrow.getAttribute('data-spx-onair') == "true" && forcedCommand == 'play') {
        // so, we are playing and needs to play (API buttons for example)
        CommandToExecute = 'play';
    }

    if (CommandToExecute == 'stop') {
        // Convert button to PLAY button and execute stop command
        // console.log('was playing. so send STOP and make button PLAY');
        itemrow.setAttribute('data-spx-onair', 'false');
        itemrow.querySelector('[name="RundownItem[onair]"]').value = 'false';
        EXPANDEDPLAY.innerText = EXPANDEDPLAY.getAttribute('data-spx-playtext');
        EXPANDEDPLAY.classList.remove('bg_red');
        EXPANDEDPLAY.classList.add('bg_green');
    }

    if (CommandToExecute == 'play') {
        // Convert button to STOP button and execute play command
        // first we need to dim all other elements which are playing on same output channel / layer
        // console.log('was stopped. so send PLAY and make button STOP');
        let PlayoutConfig = itemrow.querySelector('[data-spx-name="playoutConfig"]').innerText.split(" ").join("-");
        rows.forEach(function (item, index) {
            let CurrentConfig = item.querySelector('[data-spx-name="playoutConfig"]').innerText.split(" ").join("-");
            if (item.getAttribute('data-spx-onair') == "true" && CurrentConfig == PlayoutConfig) {
                // console.log('Dom item ' + index + ' is the same, so dim it');
                item.setAttribute('data-spx-onair', 'false');
                item.querySelector('[name="RundownItem[onair]"]').value = 'false';
                CancelOutTimerIfRunning(itemrow);
                curExpandedPlay = item.querySelector('[data-spx-name="playbutton"]')
                curExpandedPlay.innerText = curExpandedPlay.getAttribute('data-spx-playtext');
                curExpandedPlay.classList.remove('bg_red');
                curExpandedPlay.classList.add('bg_green');
            }
            else {
                // console.log('Dom item ' + index + ' was (' + CurrentConfig + ') not the same, so let it be...');
            }
        })
        EXPANDEDPLAY.innerText = EXPANDEDPLAY.getAttribute('data-spx-stoptext');
        EXPANDEDPLAY.classList.remove('bg_green');
        EXPANDEDPLAY.classList.add('bg_red');
        itemrow.setAttribute('data-spx-onair', 'true');
        itemrow.querySelector('[name="RundownItem[onair]"]').value = 'true';
        // // reset update buttons
        // itemrow.setAttribute('data-spx-changed','false');
        // itemrow.querySelector('[data-spx-name="updatebutton"]').classList.add('disabled');

    }

    if (ife('identifier').value == "controller") {
        // finally show or hide delete buttons on all items
        rows.forEach(function (item, index) {
            if (item.getAttribute('data-spx-onair') == "true") {
                // console.log('Hide delete buttons of ' + item.id);
                item.querySelector('[data-spx-name="deletesmall"]').style.visibility = "hidden" || (console.log('a'));
                item.querySelector('[data-spx-name="deletelarge"]').style.visibility = "hidden" || (console.log('b'));
            } else {
                // console.log('Show delete buttons of ' + item.id);
                item.querySelector('[data-spx-name="deletesmall"]').style.visibility = "visible" || (console.log('c'));
                item.querySelector('[data-spx-name="deletelarge"]').style.visibility = "visible" || (console.log('d'));
            }
        })
    }
    return CommandToExecute
} // setItemButtonStates ended

function post(path, params, method) {
    // Creates a hidden form in DOM, populates it and posts it to server.
    // Feels dumb, but works, so what the heck.
    // This is ONLY used when the POST command can yield a new page,
    // for in-page AJAX calls ajaxpost() should be used.
    const form = document.createElement('form');
    form.method = method;
    form.action = path;
    for (const key in params) {
        if (params.hasOwnProperty(key)) {
            const hiddenField = document.createElement('input');
            hiddenField.type = 'hidden';
            hiddenField.name = key;
            hiddenField.value = params[key];
            form.appendChild(hiddenField);
        }
    }
    document.body.appendChild(form);
    form.submit();
} // post ended

function resizeInput() {
    // changes headline1 width
    this.style.width = (this.value.length + 1.2) + "ch";
} // resizeInput ended

async function revealItemID(button) {
    let item = button.closest('.itemrow')
    let ID = item.getAttribute('data-spx-epoch');
    copyText(ID)
    // alert("Item ID " + ID + " was copied to clipboard.");
    var newID = prompt("Item ID " + ID + " was copied to clipboard.\nYou can change the ID here:", ID);
    if (newID != null && newID != ID) {
        // alert("New ID " + newID)
        let file = document.getElementById('datafile').value;
        let URL = `/api/v1/changeItemID?rundownfile=${file}&ID=${ID}&newID=${newID}`
        let IDchanged

        axios.get(URL)
            .then(function (response) {
                showMessageSlider('Item renamed to ' + newID + '. Reload recommended.')
                item.setAttribute('data-spx-epoch', newID);
                item.querySelector('.copyid').setAttribute('onmouseover', `tip('Copy ID ${newID}')`);
            })
            .catch(function (error) {
                showMessageSlider('Unable to rename. Use unique ID and try again.', 'error')
            });


        // if (IDchanged) {
        //     // success
        //     item.setAttribute('data-spx-epoch', newID);
        // } else {
        //     alert("Unable to change ID to " + newID + " (" + IDchanged + ").\nMake sure the ID is unique and try again.");
        // }
    } else {
        // alert("Same ID " + newID)
    }
} // revealItemID

async function revealItemTiming(button) {
    let curValue = button.textContent;
    let ID = button.closest('.itemrow').getAttribute('data-spx-epoch');
    var newValue = prompt("You can change timing here. Use 'manual', 'none' or millisecond values (1000=1s):", curValue);
    if (newValue != null && newValue != curValue) {
        let file = document.getElementById('datafile').value;
        let URL = `/api/v1/changeItemData?rundownfile=${file}&ID=${ID}&key=out&newValue=${newValue}`
        axios.get(URL)
            .then(function (response) {
                showMessageSlider('Item out mode changed to ' + newValue)
                button.textContent = newValue;
                button.closest('.itemrow').querySelectorAll('input[id^=out]')[0].value = newValue;
            })
            .catch(function (error) {
                showMessageSlider('Unable to change value, please try again.', 'error')
            });
    }
} // revealItemTiming

async function revealItemLayer(button) {
    let curValue = button.textContent;
    let ID = button.closest('.itemrow').getAttribute('data-spx-epoch');
    var newValue = prompt("You can change web playout layer here. Use any value between 1 and 20:", curValue);
    if (newValue != null && newValue != curValue) {
        let file = document.getElementById('datafile').value;
        let URL = `/api/v1/changeItemData?rundownfile=${file}&ID=${ID}&key=webplayout&newValue=${newValue}`
        axios.get(URL)
            .then(function (response) {
                showMessageSlider('Item webplay layer changed to ' + newValue)
                button.textContent = newValue;
                button.closest('.itemrow').querySelectorAll('input[id^=webplayout]')[0].value = newValue;
                // document.querySelectorAll('.itemrow')[0].querySelectorAll('input[id^=out]')[0];
            })
            .catch(function (error) {
                showMessageSlider('Unable to change value, please try again.', 'error')
            });
    }
} // revealItemLayer

function removeItemFromRundown(itemrow) {
    // Collect data for server processing
    data = {};
    data.command = "removeItemFromRundown";
    data.foldername = document.getElementById('foldername').value;
    data.listname = document.getElementById('filebasename').value;
    data.datafile = document.getElementById('datafile').value;
    data.epoch = itemrow.getAttribute('data-spx-epoch'); // an ARRAY INDEX, not itemId!

    // Remove from DOM
    itemrow.remove();
    event.stopPropagation(); // prevent trying to set focus to a deleted item

    // Update names for potential save at next sort
    updateFormIndexes()

    // send server command
    working('Sending ' + data.command + ' request.');
    ajaxpost('', data);

} // removeItemFromRundown ended

function updateFormIndexes() {
    // This needs to run whenever items are sorted or removed.
    // Sorting routine needs the IndexList for saving sorting to a file.
    // When deleting, this is needed to re-assing form names.
    // 1.0.13 refactored to use epochs and not item indexes.
    // var forms = document.forms;
    let IndexList = []
    let items = document.querySelectorAll('.itemrow');
    items.forEach((item, index) => {
        IndexList.push(item.getAttribute('data-spx-epoch'));
        item.querySelector('form').name = "templates[" + index + "]";
    });
    // console.log('New form list sort order before saving to file', IndexList);
    return IndexList
} // updateFormIndexes ended

function rundownPopup(mode) {
    // get current url
    let url = window.location.href;
    url = url + '/light'
    window.open(url);
} // rundownPopup ended

function SaveNewSortOrder() {
    // This will save the rundown opened in SPX, for instance when
    // items dragged to new sorting order. Maybe other events also?
    working('saving');
    let data = {};
    data.newTemplateOrderArr = updateFormIndexes(); // refactored to fix delete + sort bug.
    data.rundownfile = document.getElementById('datafile').value;
    // console.log('SaveNewSortOrder', data);
    ajaxpost('/gc/sortTemplates', data);

} // SaveNewSortOrder ended

function saveTemplateItemChanges(elementID) {
    // This is a utility function using Axios to POST
    // A FORM to server and we need to update GUI / DOM
    // accordingly.

    // Note: items might be sorted, so must check actual index
    // of called button.
    let FormNro = getDomIndexByElementId(elementID)

    working('Saving data from ElementID [' + elementID + '] = domIndex [' + FormNro + '] to server...');
    // console.log('%c Saving data from ElementID [' + elementID + '] = domIndex [' + FormNro + '] to server...', 'background: #F0F; color: #000');
    let urlPath = '/gc/saveItemChanges';

    data = {};
    data.DataFields = [];
    const form = document.getElementById('form' + elementID);
    iterator = -1;
    [...form.elements].forEach((input, index) => {
        if (input.getAttribute('data-role') == "userEditable") {
            let updatedObj = {}
            updatedObj.field = input.getAttribute('data-update');
            updatedObj.value = input.value;
            data.DataFields.push(updatedObj)
            iterator += 1;
            // console.log('Looking for ' + 'datapreview_' + FormNro + '_' + iterator);
            if (document.getElementById('datapreview_' + elementID + '_' + iterator)) {
                let temp1 = input.value.replace(/\n/g, ' ');  // remove \n globally to support text areas
                let temp2 = temp1.replace(/\r/g, '');            // remove \r globally to support text areas
                document.getElementById('datapreview_' + elementID + '_' + iterator).innerText = temp2;
            }
        }
    });

    data.rundownfile = document.getElementById('datafile').value;
    data.TemplateIdx = FormNro; // sort order on file and in dom should correspond directly
    axios.post(urlPath, data,
        {
            // headers: { 'Content-Type': 'multipart/form-data' }
        })
        .then(function (response) {
            statusbar(response.data);
            working('');
            ToggleExpand(elementID); // changed from domIndex to ElementID
        })
        .catch(function (error) {
            working('');
            if (error.response) {
                statusbar(error.response.data, 'error')
                console.log(error.response.data);
                console.log(error.response.status);
                console.log(error.response.headers);
            } else if (error.request) {
                statusbar('SPX server connection error', 'error')
                console.log(error.request);
            } else {
                statusbar('SPX request error, see console', 'warn')
                console.log('Error', error.message);
            }
            console.log(error.config);
        });
} // saveTemplateItemChanges

function saveTemplateItemChangesByElement(itemrow) {
    working('Saving changed data to server...');
    data = {};
    data.DataFields = [];
    const form = itemrow.querySelectorAll('form')[0];
    [...form.elements].forEach((input, index) => {
        if (input.getAttribute('data-role') == "userEditable") {
            let updatedObj = {}
            updatedObj.field = input.getAttribute('data-update');
            updatedObj.value = input.value;
            if (input.type === 'checkbox') {
                if (input.checked) {
                    updatedObj.value = '1';
                } else {
                    updatedObj.value = '0';
                }
            }
            data.DataFields.push(updatedObj)
        }
    });


    data.rundownfile = document.getElementById('datafile').value;
    data.epoch = itemrow.getAttribute("data-spx-epoch");
    axios.post('/gc/saveItemChanges', data, {})
        .then(function (response) {
            statusbar(response.data[0]);

            // the 2nd item from response is the html snippet for the GUI (improved in 1.0.7)
            itemrow.querySelector('.truncate').innerHTML = response.data[1];
            const unsavedChangesLabel = itemrow.querySelector('.asterisk');
            if (unsavedChangesLabel) unsavedChangesLabel.style.display = "none";

            working('');
            ToggleExpand(itemrow);
        })
        .catch(function (error) {
            working('');
            if (error.response) {
                statusbar(error.response.data, 'error')
                console.log(error.response.data);
                console.log(error.response.status);
                console.log(error.response.headers);
            } else if (error.request) {
                statusbar('SPX server connection error', 'error')
                console.log(error.request);
            } else {
                statusbar('SPX request error, see console', 'warn')
                console.log('Error', error.message);
            }
            console.log(error.config);
        });
} // saveTemplateItemChanges

function showItemIDs(show = true) {
    // Show item ID's in GUI
    let rows = document.querySelectorAll('.itemrow');
    rows.forEach((item, index) => {
        if (show == true) {
            item.querySelector('.utilityOverlay').classList.remove('hidden');
            // document.getElementById('rundownInfoMessage').style='display:flex;';
        } else if (show == false) {
            item.querySelector('.utilityOverlay').classList.add('hidden');
            // document.getElementById('rundownInfoMessage').style='display:none;';
        } else {
            item.querySelector('.utilityOverlay').classList.toggle('hidden');
        }
    });
} // showItemIDs ended

function setMasterButtonStates(itemrow, debugMessage = '') {
    // this triggers when row focuses or when Play or Stop pressed or item changed.

    if (!document.getElementById('MasterTOGGLE')) return; // this page does not have buttons...

    let TOGGLEBUTTON = document.getElementById('MasterTOGGLE');
    let UPDATEBUTTON = document.getElementById('MasterUPDATE');
    let CONTINBUTTON = document.getElementById('MasterCONTINUE');

    if (document.querySelectorAll('.itemrow').length < 1) {
        // no items on page, so disable buttons and bale out
        if (TOGGLEBUTTON) { TOGGLEBUTTON.classList.add('disabled') };
        if (UPDATEBUTTON) { UPDATEBUTTON.classList.add('disabled') };
        if (CONTINBUTTON) { CONTINBUTTON.classList.add('disabled') };
        return
    }

    // console.clear();
    // console.log('States check', typeof itemrow, itemrow);
    // console.log('CHECKING: setMasterButtonStates ' + itemrow.getAttribute('data-spx-epoch') + ' ' + debugMessage);


    // this gfx only has in-animation
    if (itemrow.querySelector('input[name="RundownItem[out]"]') && itemrow.querySelector('input[name="RundownItem[steps]"]').value == "none") {
        // console.log('This items outmode = none, so not changing button states');
        // maybe add a play and setTimeout to reset quickly...
        return;
    }

    var stepsVal = itemrow.querySelector('input[name="RundownItem[steps]"]').value || 0;
    var stepsleft = itemrow.getAttribute('data-spx-stepsleft');
    var steps = parseInt(stepsVal);
    var onAirState = String(itemrow.getAttribute('data-spx-onair') || false)
    var changState = String(itemrow.getAttribute('data-spx-changed') || false)
    onAirState = onAirState.toLowerCase();
    changState = changState.toLowerCase();
    var onair = (onAirState == 'true'); // make bool
    var chngd = (changState == 'true'); // make bool

    // console.log('Onair', onair, 'Changed', chngd, 'Steps', steps );


    // UPDATE
    // Lines disabled in Pro 1.2.2 ==> 
    // UPDATEBUTTON.classList.add('disabled');            
    // if (chngd && onair)
    //     {
    //         setTimeout(function () {
    //             UPDATEBUTTON.classList.remove('disabled');
    //             itemrow.querySelector('[data-spx-name="updatebutton"]').classList.remove('disabled');
    //         }, 2);
    //     }

    // CONTINUE
    CONTINBUTTON.classList.add('disabled');
    if (steps > 1 && onair) {
        setTimeout(function () { CONTINBUTTON.classList.remove('disabled'); }, 3);
    }

    // PLAY - STOP TOGGLE
    if (onair) {
        // console.log('Focused item IS playing (so change it to STOP)');
        TOGGLEBUTTON.classList.remove('disabled')
        TOGGLEBUTTON.innerText = TOGGLEBUTTON.getAttribute('data-spx-stoptext');
        TOGGLEBUTTON.classList.remove('bg_green');
        TOGGLEBUTTON.classList.add('bg_red');
    }
    else {
        // console.log('Focused item NOT playing (so change it to PLAY)');
        TOGGLEBUTTON.classList.remove('disabled')
        TOGGLEBUTTON.innerText = TOGGLEBUTTON.getAttribute('data-spx-playtext');
        TOGGLEBUTTON.classList.remove('bg_red');
        TOGGLEBUTTON.classList.add('bg_green');
    }
} // setTGButtonStates ended 

function hideMessageSlider() {
    if (!document.getElementById('messageSlider')) { return }
    anime({
        targets: '#messageSlider',
        opacity: 0,
        translateY: [0, -200],
        translateX: '-50%',
        duration: 300,
        easing: 'easeInCubic'
    });
} // hideMessageSlider

function showMessageSlider(msg, type = 'info', persist = false) {
    // show a sliding message at the top of the page
    // type: happy, info, warn, error
    // persist: if true, do not auto-hide
    // Example usage in templates (or extensions, remember to
    // add dom element:)
    /*
        <div id="messageSlider" style="opacity:0;"></div>
    */
    /*
        top?.showMessageSlider?.('Hello graphics operator!', 'happy');
    */


    let txt = msg;
    let typ = type; // happy, info, warn, error (classes happyMsg, infoMsg, warnMsg, errorMsg...)
    let domElement
    if (document.getElementById('messageSlider')) {
        domElement = document.getElementById('messageSlider');
    } else {
        console.warn('SPX message: ' + msg);
        return;
    }

    switch (msg) {
        case 'invalidCSV':
            txt = 'Invalid CSV. See help: import and export'
            typ = 'error'
    }

    domElement.innerHTML = txt;
    domElement.classList = typ + 'Msg';
    domElement.style.transform = 'translateX(-50%)'; // init pos
    domElement.style.opacity = 0;
    anime({
        targets: '#messageSlider',
        opacity: [0, 1],
        translateY: [-200, 0],
        translateX: '-50%',
        delay: 100,
        duration: 200,
        easing: 'easeOutCubic'
    });

    if (persist) { return }; // do not animate out

    if (messageSliderOutTimer) {
        clearTimeout(messageSliderOutTimer)
    }

    messageSliderOutTimer = setTimeout(() => {
        anime({
            targets: '#messageSlider',
            opacity: [1, 0],
            translateY: [0, -200],
            translateX: '-50%',
            duration: 300,
            easing: 'easeInCubic'
        });
    }, 2000);
} // showMessageSlider

function spx_system(cmd, servername = '') {
    // system command handler
    let sysCmd = cmd.toUpperCase()
    let data = {};
    switch (sysCmd) {
        case 'OPENWEBRENDERER':
            window.open("/renderer", 'gcwebrender', 'width=1920,height=1080,scrollbars=yes,location=yes,status=yes');
            break;

        case 'OPENWEBRENDERER_SCALABLE':
            var w = 1280;
            var h = 720;
            var left = (screen.width / 2) - (w / 2);
            var top = (screen.height / 2) - (h / 2);
            var OPT = '_blank,toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left;
            window.open('/renderer/scalable', 'gcwebrender2', OPT);
            break;

        case 'OPENDATAFOLDER':
            data.command = 'DATAFOLDER';
            break;

        case 'OPENTEMPLATEFOLDER':
            data.command = 'TEMPLATEFOLDER';
            break;

        case 'CHECKCONNECTIONS':
            console.log('Checking connections to servers...', servername);
            data.command = 'CHECKCONNECTIONS';
            data.server = servername;
            break;

        case 'RESTARTSERVER':
            // this will kill 'nodejs' -server and 'forever' utility will restart it again and again...
            data.command = 'RESTARTSERVER';
            data.reloadPage = true;
            break;

        default:
            console.log('Unknown spx_system identifer: ' + cmd);
            break;
    }

    AJAXGET('/CCG/system/' + JSON.stringify(data));
    if (data.reloadPage) {
        document.getElementById('SmartPX_App').style.opacity = '0.4';
        setTimeout('location.reload()', 1000);
    }
} // end spx_system

function e(ID) {
    return document.getElementById(ID);
} // e

function ife(ID) {
    if (document.getElementById(ID)) {
        // console.log('IFE Element found: ' + ID);
        return document.getElementById(ID);
    } else {
        // console.log('IFE Element NOT found: ' + ID);
        return false;
    }
} // ife

function spxInit() {
    // executes on page load:
    // - load values from localStorage
    // - init Sortable
    console.log('%c  SPX Graphics Controller (c) 2020- SPX Graphics  ', 'border-radius: 200px; font-size: 1.1em; padding: 0.4em; background: #0e7a27; color: #fff');


    // Init sortable and saveData onEnd
    if (ife('identifier').value == "controller") {
        sortable = Sortable.create(itemList, {
            handle: '.handle',
            animation: 150,
            disabled: false,
            // sortable.option("disabled", true); // TAI false
            onEnd: function (evt) {
                SaveNewSortOrder();
            },
        });
    }

    focusRow(0);
    AppState("DEFAULT");
    spx_system('CHECKCONNECTIONS');
    document.getElementById('itemList').style.opacity = 1;

} // end spxInit

function setProfile(profileName) {
    // FIXME: remove?
    // change profile to profileName and save to localStorage
    if (profileName == '') {
        // retrieve from localStorage
        profileName = localStorage.SPX_CT_ProfileName || '...';
    }
    document.getElementById('profname').innerText = profileName;
    localStorage.SPX_CT_ProfileName = profileName;
} // setProfile ended

function statusbar(sMsg, sLevel = "x") {
    /* Usage
        - statusbar('This is a normal message')
        - statusbar('Hot warning', "warn")
        - statusbar('Red alert', "error")
    */

    if (!document.getElementById('statusbar')) { return } // not in controller				
    let msglevel = sLevel.toUpperCase();
    // console.log('statusbar level: [' + msglevel +'], msg: [' + sMsg + '].');
    document.getElementById('statusbar').classList = "statusbar";
    switch (msglevel) {
        case "ERROR":
            document.getElementById('statusbar').classList.add("statusBarError");
            break;
        case "WARN":
            document.getElementById('statusbar').classList.add("statusBarWarn");
            break;
    }
    document.getElementById('statusbar').innerText = sMsg;
} // statusbar

function stopAll() {
    // Will send STOP commands to all layers used by current rundown.
    // Timeout here allows some time for server to handle the incoming commands. 
    // TODO: Far from elegant but kind of works. A better approach would be to 
    // develop a server-side function for this. 
    // Function implemented in v1.0.8 from ExtraFunctions -library
    clearAllTimeouts();
    console.log('Stop All');
    let ITEMS = document.querySelectorAll('.itemrow');
    ITEMS.forEach(function (templateItem, itemNro) {
        setTimeout(function () {
            // continueUpdateStop('stop', templateItem); // slower
            playItem(templateItem, 'stop');
            // setItemButtonStates(templateItem, 'stop') // just the UI
        }, (itemNro * 40)); // 20, 40, 60, 80ms etc...
    });
} // stopAll

function swap2HTMLntities(str) {
    // This fixes issue #5 re special characters
    str = str.replace(/\\/g, "&#92;") // html entity for backslash
    str = str.replace(/"/g, "&#34;") // html entity for dblquote
    str = encodeURIComponent(str);       // handle the rest
    return str;
} // end swap2HTMLntities

function Test(routine) {
    // execute a test function on the server
    // this gets triggered by menu > ping
    let data = {};
    switch (routine) {
        case 'A':
            data.spxcmd = 'loadTemplate';
            data.layer = '10';
            data.template = 'spxtestgrid.html';
            socket.emit('SPXWebRendererMessage', data);
            break;

        case 'B':
            data.spxcmd = 'playTemplate';
            data.layer = '10';
            socket.emit('SPXWebRendererMessage', data);
            break;

        case 'C':
            data.spxcmd = 'stopTemplate';
            data.layer = '10';
            socket.emit('SPXWebRendererMessage', data);
            break;


        default:
            console.log('Uknown Test', routine);
    }
} // Test ended

function tip(msg) {
    // request ..... 
    // returns ..... 
    // Describe the function here 
    e = document.getElementById('statusbar') || null;
    if (e) {
        document.getElementById('statusbar').innerText = msg;
        event.stopPropagation();
        // playServerAudio('beep', 'We are in TIP function');
    }
} // tip mgsed

function toggleAutoplay(slider, targ) {
    let Cfgdata = {};
    Cfgdata.key = 'autoplayLocalRenderer'
    if (slider.checked) {
        document.getElementById(targ).innerText = 'YES';
        Cfgdata.val = true;
    } else {
        document.getElementById(targ).innerText = 'NO';
        Cfgdata.val = false;
    }
    // console.log('Sending config change to server', Cfgdata);
    ajaxpost('/gc/saveConfigChanges', Cfgdata);
} // toggleAutoplay

function toggleLRendererHandler(slider, targ) {
    let Cfgdata = {};
    Cfgdata.key = 'disableLocalRenderer'
    if (slider.checked) {
        document.getElementById(targ).innerText = 'YES';
        document.getElementById('previewIF').src = '/templates/empty.html';
        document.getElementById('LocalRendererDisabledNotification').style.opacity = 1;
        Cfgdata.val = true;

    } else {
        document.getElementById('previewIF').src = '/renderer';
        document.getElementById(targ).innerText = 'NO';
        document.getElementById('LocalRendererDisabledNotification').style.opacity = 0;
        Cfgdata.val = false;
    }
    // console.log('Sending config change to server', Cfgdata);
    ajaxpost('/gc/saveConfigChanges', Cfgdata);
} // toggleLRendererHandler

function toggleSwitchHandler(slider, targ, type) {
    // When program/preview toggle buttons are clicked.
    // console.log('toggleSwitchHandler', slider, targ);
    let data = {}
    data.type = type;
    let handle = slider.querySelector('.vc-handle');
    if (slider.checked) {
        data.command = 'open';
        document.getElementById(targ).innerText = 'ON';
    } else {
        data.command = 'close';
        document.getElementById(targ).innerText = 'OFF';
    }
    handleRendererPopups(data)
} // toggleSwitchHandler

function toggleTip(targetField, source, attr) {
    document.getElementById(targetField).innerText = source.getAttribute(attr);
} // toggleTip

function toggleActive(ServerName = '') {
    // Will enable / disable commands to the server
    // CCG/disable {server:'OVERLAY, disable:false}
    let e = document.getElementById('server' + ServerName);
    let targetState = false;
    if (e && e.classList.contains('disabledServer')) {
        // Enable
        e.classList.remove('disabledServer')
        targetState = false
    } else {
        // Disable
        e.classList.add('disabledServer')
        targetState = true
    }

    let data = {};
    data.server = ServerName;
    data.disabled = targetState;
    working('Changing server connection state to [' + targetState + ']...');
    ajaxpost('/CCG/disable', data);
} // toggleActive

function ToggleExpand(rowelement = '') {
    if (!rowelement) {
        // rowelement not given, get focused line
        rowelement = getFocusedRow();
    }
    // console.log('Toggle row id ' + rowelement.id);
    let Expanded = rowelement.querySelector('#Expanded')
    let Collapsed = rowelement.querySelector('#Collapsed')

    if (Collapsed.style.display == "none") {
        // We were open, so lets COLLAPSE
        Collapsed.style.display = "block";
        Expanded.style.display = "none";
        AppState('DEFAULT');
    } else {
        // We were closed, so lets EXPAND and set focus to first text field
        Collapsed.style.display = "none";
        Expanded.style.display = "block";
        if (Expanded.querySelectorAll('.gcinput').length > 0) {
            // if there are input fields, go to editor mode (and disable dragsort)
            // let firstFormElement = Expanded.querySelectorAll('.gcinput')[0];
            // if (firstFormElement.type=="text") {
            //         firstFormElement.focus();
            //         firstFormElement.select();
            //     }
            AppState('EDITING');
        }
    }
} // ToggleExpand

function updateItem(itemrow) {
    // request ..... rundown template index
    // returns ..... ajax response message to GUI
    // Will send data object with an index and playlist filename
    // and playout handler will parse required data and so on. 

    if (!itemrow) { itemrow = getFocusedRow() }

    const isOnAir = itemrow.getAttribute('data-spx-onair');

    data = {};
    data.command = 'update';
    data.datafile = document.getElementById('datafile').value;

    data.relpath = itemrow.querySelector('[name="RundownItem[relpath]"]').value;
    data.playserver = itemrow.querySelector('[name="RundownItem[playserver]"]').value;
    data.playchannel = itemrow.querySelector('[name="RundownItem[playchannel]"]').value;
    data.playlayer = itemrow.querySelector('[name="RundownItem[playlayer]"]').value;
    data.webplayout = itemrow.querySelector('[name="RundownItem[webplayout]"]').value;
    data.epoch = itemrow.getAttribute('data-spx-epoch');

    data.fields = [];
    let CurrentDomFields = itemrow.querySelectorAll("[data-update]");

    CurrentDomFields.forEach((item, index) => {
        let formField = {};
        formField.field = item.getAttribute('data-update');
        formField.value = item.value;
        if (item.type === 'checkbox') {
            if (item.checked) {
                formField.value = '1'
            } else {
                formField.value = '0'
            }
        }
        data.fields.push(formField);
    });

    // Note, data here IS in internal array format [{"field":"f1", "value":"Hello"},{"field":"f2", "value":"World"},]
    // and MUST NOT change. Format it downstream for different renderers.
    if (isOnAir == "true") ajaxpost('/gc/playout', data, 'true');
} // updateItem

// Check input change, then update preview
function checkChange(element) {
    let originalValue;

    if (element.tagName === 'INPUT') {
        originalValue = element.defaultValue;
    } else if (element.tagName === 'SELECT') {
        originalValue = element.querySelector("option[selected]").value;
    }

    const itemrow = getFocusedRow();
    const unsavedChangesLabel = itemrow.querySelector('.asterisk');

    if (element.value !== originalValue) {
        unsavedChangesLabel.style.display = "initial";
    } else {
        unsavedChangesLabel.style.display = "none";
    }

    updatePreview();
}

// Reset to original values
function resetToOriginalValues() {
    const itemrow = getFocusedRow();
    const unsavedChangesLabel = itemrow.querySelector('.asterisk');
    const inputs = itemrow.querySelectorAll('input, select');

    inputs.forEach(function (element) {
        if (element.tagName === 'INPUT' && element.getAttribute('data-role') === 'userEditable') {
            element.value = element.defaultValue;
        } else if (element.tagName === 'SELECT') {
            var originalOption = element.querySelector('option[selected]');
            if (originalOption) {
                element.value = originalOption.value;
            } else {
                element.selectedIndex = 0;
            }
        }
    });

    unsavedChangesLabel.style.display = "none";

    updatePreview();
}

function updatePreview(itemrow) {
    // request ..... rundown template index
    // returns ..... ajax response message to GUI
    // Will send data object with an index and playlist filename
    // and playout handler will parse required data and so on. 

    if (!itemrow) { itemrow = getFocusedRow() }

    data = {};
    data.command = 'update';
    data.datafile = document.getElementById('datafile').value;

    data.relpath = itemrow.querySelector('[name="RundownItem[relpath]"]').value;
    data.playserver = itemrow.querySelector('[name="RundownItem[playserver]"]').value;
    data.playchannel = itemrow.querySelector('[name="RundownItem[playchannel]"]').value;
    data.playlayer = itemrow.querySelector('[name="RundownItem[playlayer]"]').value;
    data.webplayout = itemrow.querySelector('[name="RundownItem[webplayout]"]').value;
    data.epoch = itemrow.getAttribute('data-spx-epoch');

    data.fields = [];
    let CurrentDomFields = itemrow.querySelectorAll("[data-update]");

    CurrentDomFields.forEach((item, index) => {
        let formField = {};
        formField.field = item.getAttribute('data-update');
        formField.value = item.value;
        if (item.type === 'checkbox') {
            if (item.checked) {
                formField.value = '1'
            } else {
                formField.value = '0'
            }
        }
        data.fields.push(formField);
    });

    // Get the preview div by its id
    const previewBG = document.getElementById("previewIFAlt");
    // Get the layer1 iframe by its id
    if (previewBG) {
        const layer1 = previewBG.contentDocument.getElementById("layer1");
        // Get the graphics divs by their ids
        if (layer1) {
            let horizontal = "";
            data.fields.forEach((fieldData) => {
                const fieldNumber = parseInt(fieldData.field.substring(1)); // Get the number part of the field (i.e., '0' from 'f0')
                if (fieldNumber) {
                    // Get template number
                    const relpath = data.relpath;
                    const regex = /(\d{4})\.html/;
                    const match = relpath.match(regex);
                    let templateNumber = "";
                    if (match) {
                        const digits = match[1];
                        templateNumber = digits;
                    }
                    const wrapper = layer1.contentDocument.getElementById('custom-container');
                    // Multiple Templates - Bottom
                    if (fieldNumber == 97) {
                        wrapper.style.bottom = `${fieldData.value}px`;
                    }
                    // Multiple Templates - Left
                    if (fieldNumber == 98) {
                        wrapper.style.left = `${fieldData.value}px`;
                    }
                    // Width for Quiz Score
                    if (fieldNumber == 99) {
                        wrapper.style.width = `${fieldData.value}vw`;
                    }
                    // Olympics Results Individual Template --------------------------
                    if (relpath.includes('RESULTS_INDIVIDUAL')) {
                        if (fieldNumber == 70) {
                            const resultElements = layer1.contentDocument.querySelectorAll('.result');
                            let showResults = fieldData.value;
                            if (resultElements && resultElements.length > 0) {
                                resultElements.forEach((resultElement) => {
                                    if (showResults == "Show Results" && resultElement) {
                                        resultElement.style.display = 'flex';
                                    } else {
                                        resultElement.style.display = 'none';
                                    }
                                });
                            }
                        }
                    }

                    // NYE - Box Titles Template ------------------------------------
                    if (relpath.includes('DOUBLE_BOX_TITLES')) {
                        const defaultLocationLeftEl = layer1.contentDocument.getElementById('f1_gfx_alt');
                        const defaultLocationRightEl = layer1.contentDocument.getElementById('f1_gfx_alt_2');
                        const customLeftEl = layer1.contentDocument.getElementById('f2_gfx');
                        const customRightEl = layer1.contentDocument.getElementById('f3_gfx');
                        let location = undefined;
                        let customLeft = undefined;
                        let customRight = undefined;
                        if (fieldNumber == 1) {
                            location = fieldData.value;
                        }
                        if (fieldNumber == 2) {
                            customLeft = fieldData.value;
                        }
                        if (fieldNumber == 3) {
                            customRight = fieldData.value;
                        }
                        let left = undefined;
                        let right = undefined;
                        if (location !== undefined) {
                            const parts = location.split('|').map(part => part.trim());
                            left = parts[0];
                            right = parts[1];
                            defaultLocationLeftEl.innerText = left;
                            defaultLocationRightEl.innerText = right;
                            defaultLocationLeftEl.style.display = 'initial';
                            customLeftEl.style.display = 'none';
                            defaultLocationRightEl.style.display = 'initial';
                            customRightEl.style.display = 'none';
                        }
                        // Custom Left & Right
                        if (customLeft && customLeft.length > 0 || customRight && customRight.length > 0) {
                            defaultLocationLeftEl.style.display = 'none';
                            customLeftEl.style.display = 'initial';
                            defaultLocationRightEl.style.display = 'none';
                            customRightEl.style.display = 'initial';
                        }
                    }

                    // NYE - Countdown Template -------------------------------------
                    if (relpath.includes('L3_COUNTDOWN')) {
                        let timezone = undefined;
                        if (fieldNumber == 1) {
                            timezone = fieldData.value;
                        }
                        const timezoneContainer = layer1.contentDocument.querySelector('.timezone');
                        if (timezone && timezone.includes('Mountain')) {
                            timezoneContainer.style.fontSize = '21px';
                        }
                        if (timezone && timezone.includes('Newfoundland')) {
                            timezoneContainer.style.fontSize = '23px';
                        }
                    }

                    // NYE - Host Key Template --------------------------------------
                    if (relpath.includes('L3_HOST_KEY')) {
                        if (fieldNumber == 1) {
                            const hostChoice = fieldData.value;
                            const elements = {
                                host1: layer1.contentDocument.querySelector('.host-1'),
                                host1Alt: layer1.contentDocument.querySelector('.host-1-alt'),
                                host2: layer1.contentDocument.querySelector('.host-2'),
                                host3: layer1.contentDocument.querySelector('.host-3'),
                                host4: layer1.contentDocument.querySelector('.host-4'),
                                group1: layer1.contentDocument.getElementById('group1'),
                                group2: layer1.contentDocument.getElementById('group2'),
                            };

                            // Hide all elements by default
                            Object.values(elements).forEach(element => {
                                element.style.display = 'none';
                            });

                            // Show specific elements based on the hostChoice
                            if (hostChoice == 'Adrienne') {
                                elements.host1Alt.style.display = 'initial';
                                elements.group1.style.display = 'initial';
                            } else if (hostChoice == 'Adrienne / Jann') {
                                elements.host1.style.display = 'initial';
                                elements.host2.style.display = 'initial';
                                elements.group2.style.display = 'initial';
                            } else if (hostChoice == 'Ian') {
                                elements.host3.style.display = 'initial';
                                elements.group1.style.display = 'initial';
                            } else if (hostChoice == 'Ian / Ali') {
                                elements.host3.style.display = 'initial';
                                elements.host4.style.display = 'initial';
                                elements.group2.style.display = 'initial';
                            }
                        }
                    }

                    // NYE - Locator Template ---------------------------------------
                    if (relpath.includes('L3_LOCATOR')) {
                        // Show / Hide Time Tab
                        const timeSpan = layer1.contentDocument.getElementById('time-span');
                        if (fieldNumber == 3) {
                            timeStatus = fieldData.value;
                            if (timeStatus == "Hide") {
                                timeSpan.style.display = "none";
                            } else {
                                timeSpan.style.display = "initial";
                            }
                        }
                    }

                    // NYE - Super Template ----------------------------------------
                    if (relpath.includes('L3_SUPER')) {
                        const defaultNameEl = layer1.contentDocument.getElementById('f1_gfx_alt');
                        const defaultTitleEl = layer1.contentDocument.getElementById('f1_gfx_alt_2');
                        const customNameEl = layer1.contentDocument.getElementById('f2_gfx');
                        const customTitleEl = layer1.contentDocument.getElementById('f3_gfx');
                        let nameTitle = undefined;
                        let customName = undefined;
                        let customTitle = undefined;
                        if (fieldNumber == 1) {
                            nameTitle = fieldData.value;
                        }
                        if (fieldNumber == 2) {
                            customName = fieldData.value;
                        }
                        if (fieldNumber == 3) {
                            customTitle = fieldData.value;
                        }
                        let name = undefined;
                        let title = undefined;
                        if (nameTitle !== undefined) {
                            const parts = nameTitle.split('|').map(part => part.trim());
                            name = parts[0];
                            title = parts[1];
                            defaultNameEl.innerText = name;
                            defaultTitleEl.innerText = title;
                            defaultNameEl.style.display = 'flex';
                            customNameEl.style.display = 'none';
                            defaultTitleEl.style.display = 'flex';
                            customTitleEl.style.display = 'none';
                        }
                        // Custom Name & Title
                        if (customName && customName.length > 0 || customTitle && customTitle.length > 0) {
                            defaultNameEl.style.display = 'none';
                            customNameEl.style.display = 'flex';
                            defaultTitleEl.style.display = 'none';
                            customTitleEl.style.display = 'flex';
                        }
                    }

                    // NYE - QR Code Template ---------------------------------------
                    if (relpath.includes('QR_CODE')) {
                        let text1 = undefined;
                        let text2 = undefined;
                        if (fieldNumber == 1) {
                            text1 = fieldData.value;
                        }
                        if (fieldNumber == 2) {
                            text2 = fieldData.value;
                        }
                        const container = layer1.contentDocument.querySelector('.container');
                        const text1El = layer1.contentDocument.getElementById('f1_gfx');
                        const text2El = layer1.contentDocument.getElementById('f2_gfx');
                        if (text1 !== undefined && text1.length == 0) {
                            text1El.classList.add('hide');
                        } else {
                            text1El.classList.remove('hide');
                        }
                        if (text2 !== undefined && text2.length == 0) {
                            text2El.classList.add('hide');
                        } else {
                            text2El.classList.remove('hide');
                            text1El.style.display = 'block';
                        }
                        if (text1 !== undefined && text1.length == 0 || text2 !== undefined && text2.length == 0) {
                            container.className = 'container alt-height';
                        } else {
                            container.className = 'container';
                        }
                    }

                    // Template 9000 ------------------------------
                    if (templateNumber == 9000) {
                        let flagNameShouldShow = null;
                        let triCodeStatus = null;
                        let flagNameText = null;

                        processElement('f68_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        processElement('f2_gfx', layer1);
                        processElement('f3_gfx', layer1);
                        processElement('f4_gfx', layer1);
                        // const flagName = layer1.contentDocument.querySelector('.flag-name');
                        const flag = layer1.contentDocument.querySelector('.flag-container');
                        // Bottom Bar
                        if (fieldNumber == 2) {
                            const subtitleText = fieldData.value;
                            const bottomBox = layer1.contentDocument.querySelector('.bottom-box');
                            if (subtitleText.length > 0) {
                                bottomBox.style.display = "initial";
                            } else {
                                bottomBox.style.display = "none";     
                            }
                        }
                        // Upper Text
                        if (fieldNumber == 3) {
                            let upperText = fieldData.value;
                            const upperTab = layer1.contentDocument.querySelector('.top-box-container');
                            if (upperText.length > 0) {
                                upperTab.style.display = "initial";
                            } else {
                                upperTab.style.display = "none";     
                            }
                        }
                        // Jersey Text
                        if (fieldNumber == 4) {
                            let jerseyText = fieldData.value;
                            const jerseyElement = layer1.contentDocument.querySelector('.jersey');
                            if (jerseyText.length > 0) {
                                jerseyElement.style.display = "flex";
                            } else {
                                jerseyElement.style.display = "none";     
                            }
                        }
                        // Flag Change
                        if (fieldNumber == 68) {
                            const selectedFlagFile = flags.find(f => f.slice(13, 16) == fieldData.value);
                            if (selectedFlagFile) {
                                flag.src = selectedFlagFile;
                                flag.style.display = "initial";
                                flagNameText = fieldData.value;
                                flagNameShouldShow = true;
                            } else {
                                flag.style.display = "none";
                                flagNameShouldShow = false;
                            }
                        }

                        if (fieldNumber == 70) {
                            triCodeStatus = fieldData.value;
                        }

                        const flagName = layer1.contentDocument.querySelector('.flag-name');
                        if (flagName) {
                            if (triCodeStatus === "Hide") {
                                flagName.style.display = "none";
                            } else if (flagNameShouldShow) {
                                flagName.textContent = flagNameText;
                                flagName.style.display = "inline-block";
                            } else {
                                flagName.style.display = "none";
                            }
                        }
                        // console.log('test', window.getComputedStyle(flagName).display);
                        console.log(triCodeStatus, flagNameShouldShow);
                    }
                    // Template 9002 -------------------------------
                    if (templateNumber == 9002) {
                        processElement('f0_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        // Social Icon Toggle
                        if (fieldNumber == 70) {
                            const twitter = layer1.contentDocument.getElementById('twitter1');
                            const instagram = layer1.contentDocument.getElementById('instagram1');
                            const text1 = layer1.contentDocument.getElementById('f1_gfx');
                            let socialIcon = fieldData.value;
                            if (socialIcon == "Twitter") {
                                twitter.style.display = "initial";
                                instagram.style.display = "none";
                                text1.style.top = "initial";
                            } else if (socialIcon == "Instagram") {
                                twitter.style.display = "none";
                                instagram.style.display = "initial";
                                text1.style.top = "initial";
                            } else {
                                twitter.style.display = "none";
                                instagram.style.display = "none";
                                text1.style.top = "6px";
                            }
                        }
                    }
                    // Template 9003 ------------------------------
                    if (templateNumber == 9003) {
                        processElement('f0_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        processElement('f2_gfx', layer1);
                        processElement('f3_gfx', layer1);
                        // Social Icon Toggle
                        if (fieldNumber == 70) {
                            const twitter1 = layer1.contentDocument.getElementById('twitter1');
                            const instagram1 = layer1.contentDocument.getElementById('instagram1');
                            const twitter2 = layer1.contentDocument.getElementById('twitter2');
                            const instagram2 = layer1.contentDocument.getElementById('instagram2');
                            const text1 = layer1.contentDocument.getElementById('f1_gfx');
                            const text2 = layer1.contentDocument.getElementById('f3_gfx');
                            let socialIcon = fieldData.value;
                            if (socialIcon == "Twitter") {
                                twitter1.style.display = "initial";
                                instagram1.style.display = "none";
                                twitter2.style.display = "initial";
                                instagram2.style.display = "none";
                                text1.style.top = "initial";
                                text2.style.top = "initial";
                                text2.style.left = "initial";
                            } else if (socialIcon == "Instagram") {
                                twitter1.style.display = "none";
                                instagram1.style.display = "initial";
                                twitter2.style.display = "none";
                                instagram2.style.display = "initial";
                                text1.style.top = "initial";
                                text2.style.top = "initial";
                                text2.style.left = "initial";
                            } else {
                                twitter1.style.display = "none";
                                instagram1.style.display = "none";
                                twitter2.style.display = "none";
                                instagram2.style.display = "none";
                                text1.style.top = "6px";
                                text1.style.left = "5px";
                                text2.style.top = "6px";
                                text2.style.left = "50px";
                            }
                        }
                    }
                    // Template 9004 ------------------------------
                    if (templateNumber == 9004) {
                        processElement('f0_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        processElement('f2_gfx', layer1);
                        processElement('f3_gfx', layer1);
                        processElement('f4_gfx', layer1);
                        processElement('f5_gfx', layer1);
                        // Social Icon Toggle
                        if (fieldNumber == 70) {
                            const twitter1 = layer1.contentDocument.getElementById('twitter1');
                            const instagram1 = layer1.contentDocument.getElementById('instagram1');
                            const twitter2 = layer1.contentDocument.getElementById('twitter2');
                            const instagram2 = layer1.contentDocument.getElementById('instagram2');
                            const twitter3 = layer1.contentDocument.getElementById('twitter3');
                            const instagram3 = layer1.contentDocument.getElementById('instagram3');
                            const text1 = layer1.contentDocument.getElementById('f1_gfx');
                            const text2 = layer1.contentDocument.getElementById('f3_gfx');
                            const text3 = layer1.contentDocument.getElementById('f5_gfx');
                            let socialIcon = fieldData.value;
                            if (socialIcon == "Twitter") {
                                twitter1.style.display = "initial";
                                instagram1.style.display = "none";
                                twitter2.style.display = "initial";
                                instagram2.style.display = "none";
                                twitter3.style.display = "initial";
                                instagram3.style.display = "none";
                                text1.style.top = "initial";
                                text2.style.top = "initial";
                                text2.style.left = "initial";
                                text3.style.top = "initial";
                                text3.style.left = "initial";
                            } else if (socialIcon == "Instagram") {
                                twitter1.style.display = "none";
                                instagram1.style.display = "initial";
                                twitter2.style.display = "none";
                                instagram2.style.display = "initial";
                                twitter3.style.display = "none";
                                instagram3.style.display = "initial";
                                text1.style.top = "initial";
                                text1.style.left = "-5px";
                                text2.style.top = "initial";
                                text2.style.left = "-5px";
                                text3.style.top = "initial";
                                text3.style.left = "initial";
                            } else {
                                twitter1.style.display = "none";
                                instagram1.style.display = "none";
                                twitter2.style.display = "none";
                                instagram2.style.display = "none";
                                twitter3.style.display = "none";
                                instagram3.style.display = "none";
                                text1.style.top = "6px";
                                text2.style.top = "6px";
                                text2.style.left = "50px";
                                text3.style.top = "6px";
                                text3.style.left = "50px";
                            }
                        }
                    }
                    // Template 9005 ------------------------------
                    if (templateNumber == 9005) {
                        processElement('f0_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        processElement('f2_gfx', layer1);
                        // Upper Tab Show / Hide
                        if (fieldNumber == 70) {
                            const upperTab = layer1.contentDocument.querySelector('.top-box-container');
                            let tabStatus = fieldData.value;
                            if (tabStatus == "No Upper Tab") {
                                upperTab.style.display = "none";
                            } else {
                                upperTab.style.display = "initial";
                            }
                        }
                    }
                    // Template 9007 ------------------------------
                    if (templateNumber == 9007) {
                        processElement('f0_gfx', layer1);
                    }
                    // Template 9008 ------------------------------
                    if (templateNumber == 9008) {
                        processElement('f0_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        processElement('f2_gfx', layer1);
                        // Show / Hide Upper Tab
                        if (fieldNumber == 70) {
                            const upperTab = layer1.contentDocument.querySelector('.top-box-container');
                            const tabStatus = fieldData.value;
                            if (tabStatus == "No Upper Tab") {
                                upperTab.style.display = "none";
                            } else {
                                upperTab.style.display = "initial";
                            }
                        }
                    }
                    // Template 9012 ------------------------------
                    if (templateNumber == 9012) {
                        const image1 = layer1.contentDocument.querySelector('.left-image1');
                        const image2 = layer1.contentDocument.querySelector('.left-image2');
                        // Social Media Icon
                        if (fieldNumber == 70) {
                            const twitter1 = layer1.contentDocument.getElementById('twitter1');
                            const instagram1 = layer1.contentDocument.getElementById('instagram1');
                            const twitter2 = layer1.contentDocument.getElementById('twitter2');
                            const instagram2 = layer1.contentDocument.getElementById('instagram2');
                            let socialIcon = fieldData.value;
                            if (socialIcon == "Twitter") {
                                twitter1.style.display = "initial";
                                instagram1.style.display = "none";
                                twitter2.style.display = "initial";
                                instagram2.style.display = "none";
                            } else if (socialIcon == "Instagram") {
                                twitter1.style.display = "none";
                                instagram1.style.display = "initial";
                                twitter2.style.display = "none";
                                instagram2.style.display = "initial";
                            } else {
                                twitter1.style.display = "none";
                                instagram1.style.display = "none";
                                twitter2.style.display = "none";
                                instagram2.style.display = "none";
                            }
                        }
                        // Social Text
                        if (fieldNumber == 71) {
                            const socialText1 = layer1.contentDocument.querySelector('.sm1');
                            const socialText2 = layer1.contentDocument.querySelector('.sm2');
                            const text1 = layer1.contentDocument.getElementById('f2_gfx');
                            const text2 = layer1.contentDocument.getElementById('f0_gfx');
                            let socialText = fieldData.value;
                            if (socialText !== "Show") {
                                socialText1.style.display = "none";
                                socialText2.style.display = "none";
                                text1.classList.add('no-social-media');
                                text2.classList.add('no-social-media');
                            } else {
                                socialText1.style.display = "flex";
                                socialText2.style.display = "flex";
                                text1.classList.remove('no-social-media');
                                text2.classList.remove('no-social-media');
                            }
                        }
                        // Font Size
                        if (fieldNumber == 90) {
                            const textElements = layer1.contentDocument.querySelectorAll('.text-layer-9012');
                            let newFontSize = fieldData.value;
                            newFontSize = Math.max(20, Math.min(newFontSize, 200));
                            const ratio = newFontSize / 100;
                            const originalFontSize = 28;
                            textElements.forEach(element => {
                                element.style.fontSize = `${originalFontSize * ratio}px`;
                            });
                        }
                        // Image 1
                        if (fieldNumber == 81) {
                            if (fieldData.value) image1.src = fieldData.value;
                        }
                        // Zoom
                        if (fieldNumber == 91) {
                            image1.style.width = `${fieldData.value}%`;
                        }
                        // X-Axis
                        if (fieldNumber == 92) {
                            horizontal = `${fieldData.value}px`;
                        }
                        // Y-Axis
                        if (fieldNumber == 93) {
                            const vertical = `${fieldData.value}px`;
                            image1.style.objectPosition = `${horizontal} ${vertical}`;
                        }
                        // Image 2
                        if (fieldNumber == 82) {
                            if (fieldData.value) image2.src = fieldData.value;
                        }
                        // Zoom
                        if (fieldNumber == 94) {
                            image2.style.width = `${fieldData.value}%`;
                        }
                        // X-Axis
                        if (fieldNumber == 95) {
                            horizontal = `${fieldData.value}px`;
                        }
                        // Y-Axis
                        if (fieldNumber == 96) {
                            const vertical = `${fieldData.value}px`;
                            image2.style.objectPosition = `${horizontal} ${vertical}`;
                        }
                    }
                    // Template 9013 ------------------------------
                    if (templateNumber == 9013) {
                        const image1 = layer1.contentDocument.querySelector('.left-image1');
                        const image2 = layer1.contentDocument.querySelector('.left-image2');
                        const image3 = layer1.contentDocument.querySelector('.left-image3');
                        // Social Media Icon
                        if (fieldNumber == 70) {
                            const twitter1 = layer1.contentDocument.getElementById('twitter1');
                            const instagram1 = layer1.contentDocument.getElementById('instagram1');
                            const twitter2 = layer1.contentDocument.getElementById('twitter2');
                            const instagram2 = layer1.contentDocument.getElementById('instagram2');
                            const twitter3 = layer1.contentDocument.getElementById('twitter3');
                            const instagram3 = layer1.contentDocument.getElementById('instagram3');
                            let socialIcon = fieldData.value;
                            if (socialIcon == "Twitter") {
                                twitter1.style.display = "initial";
                                instagram1.style.display = "none";
                                twitter2.style.display = "initial";
                                instagram2.style.display = "none";
                                twitter3.style.display = "initial";
                                instagram3.style.display = "none";
                            } else if (socialIcon == "Instagram") {
                                twitter1.style.display = "none";
                                instagram1.style.display = "initial";
                                twitter2.style.display = "none";
                                instagram2.style.display = "initial";
                                twitter3.style.display = "none";
                                instagram3.style.display = "initial";
                            } else {
                                twitter1.style.display = "none";
                                instagram1.style.display = "none";
                                twitter2.style.display = "none";
                                instagram2.style.display = "none";
                                twitter3.style.display = "none";
                                instagram3.style.display = "none";
                            }
                        }
                        // Social Text
                        if (fieldNumber == 71) {
                            const socialText1 = layer1.contentDocument.querySelector('.sm1');
                            const socialText2 = layer1.contentDocument.querySelector('.sm2');
                            const socialText3 = layer1.contentDocument.querySelector('.sm3');
                            const text1 = layer1.contentDocument.getElementById('f0_gfx');
                            const text2 = layer1.contentDocument.getElementById('f2_gfx');
                            const text3 = layer1.contentDocument.getElementById('f5_gfx');
                            let socialText = fieldData.value;
                            if (socialText !== "Show") {
                                socialText1.style.display = "none";
                                socialText2.style.display = "none";
                                socialText3.style.display = "none";
                                text1.classList.add('no-social-media');
                                text2.classList.add('no-social-media');
                                text3.classList.add('no-social-media');
                            } else {
                                socialText1.style.display = "flex";
                                socialText2.style.display = "flex";
                                socialText3.style.display = "flex";
                                text1.classList.remove('no-social-media');
                                text2.classList.remove('no-social-media');
                                text3.classList.remove('no-social-media');
                            }
                        }
                        // Font Size
                        if (fieldNumber == 90) {
                            const textElements = layer1.contentDocument.querySelectorAll('.text-layer-9013');
                            let newFontSize = fieldData.value;
                            newFontSize = Math.max(20, Math.min(newFontSize, 200));
                            const ratio = newFontSize / 100;
                            const originalFontSize = 28;
                            textElements.forEach(element => {
                                element.style.fontSize = `${originalFontSize * ratio}px`;
                            });
                        }
                        // Image 1
                        if (fieldNumber == 81) {
                            if (fieldData.value) image1.src = fieldData.value;
                        }
                        // Zoom
                        if (fieldNumber == 91) {
                            image1.style.width = `${fieldData.value}%`;
                        }
                        // X-Axis
                        if (fieldNumber == 92) {
                            horizontal = `${fieldData.value}px`;
                        }
                        // Y-Axis
                        if (fieldNumber == 93) {
                            const vertical = `${fieldData.value}px`;
                            image1.style.objectPosition = `${horizontal} ${vertical}`;
                        }
                        // Image 2
                        if (fieldNumber == 82) {
                            if (fieldData.value) image2.src = fieldData.value;
                        }
                        // Zoom
                        if (fieldNumber == 94) {
                            image2.style.width = `${fieldData.value}%`;
                        }
                        // X-Axis
                        if (fieldNumber == 95) {
                            horizontal = `${fieldData.value}px`;
                        }
                        // Y-Axis
                        if (fieldNumber == 96) {
                            const vertical = `${fieldData.value}px`;
                            image2.style.objectPosition = `${horizontal} ${vertical}`;
                        }
                        // Image 3
                        if (fieldNumber == 83) {
                            if (fieldData.value) image3.src = fieldData.value;
                        }
                        // Zoom
                        if (fieldNumber == 87) {
                            image3.style.width = `${fieldData.value}%`;
                        }
                        // X-Axis
                        if (fieldNumber == 88) {
                            horizontal = `${fieldData.value}px`;
                        }
                        // Y-Axis
                        if (fieldNumber == 89) {
                            const vertical = `${fieldData.value}px`;
                            image3.style.objectPosition = `${horizontal} ${vertical}`;
                        }
                    }
                    // Template 9040 ------------------------------
                    if (templateNumber == 9040) {
                        processElement('f0_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        processElement('f2_gfx', layer1);
                        processElement('f3_gfx', layer1);
                        processElement('f4_gfx', layer1);
                        const mainImg = layer1.contentDocument.querySelector('.left-image');
                        const upperTab = layer1.contentDocument.querySelector('.top-box-container');
                        const line2 = layer1.contentDocument.getElementById('f1_gfx');
                        const time = layer1.contentDocument.getElementById('f2_gfx');
                        // Show / Hide Header
                        if (fieldNumber == 70) {
                            const tabStatus = fieldData.value;
                            if (tabStatus == "No Header") {
                                upperTab.style.display = "none";
                            } else {
                                upperTab.style.display = "initial";
                            }
                        }
                        // Show / Hide Time or Line2
                        if (fieldNumber == 71) {
                            const showTime = fieldData.value;
                            if (showTime == "Show Line 2") {
                                line2.style.display = "initial";
                                time.style.display = "none";
                            } else {
                                line2.style.display = "none";
                                time.style.display = "inherit";
                            }
                        }
                        // Font Size
                        if (fieldNumber == 90) {
                            const textElements = layer1.contentDocument.querySelectorAll('.resize');
                            const top = layer1.contentDocument.querySelector('.top');
                            const bottoms = layer1.contentDocument.querySelectorAll('.bottom');
                            let newFontSize = fieldData.value;
                            newFontSize = Math.max(20, Math.min(newFontSize, 200));
                            const ratio = newFontSize / 100;
                            const originalFontSize = 38;
                            const newSize = originalFontSize * ratio;
                            textElements.forEach(element => {
                                element.style.fontSize = `${originalFontSize * ratio}px`;
                            });
                            // Margin Top based on Font Size
                            let difference;
                            if (newSize < originalFontSize) {
                                difference = originalFontSize - newSize;
                                difference = Math.min(difference, 10);
                                let baseTopValueTop = 10;
                                let baseTopValueBottom = 15;
                                baseTopValueTop += difference;
                                top.style.top = `${baseTopValueTop}px`;

                                bottoms.forEach((bottom) => {
                                    baseTopValueBottom += difference;
                                    bottom.style.top = `${baseTopValueBottom}px`;
                                });
                            }
                        }
                        // Main Img
                        if (fieldNumber == 81) {
                            if (fieldData.value) mainImg.src = fieldData.value;
                        }
                        // Zoom
                        if (fieldNumber == 94) {
                            mainImg.style.width = `${fieldData.value}%`;
                        }
                        // X-Axis
                        if (fieldNumber == 95) {
                            horizontal = `${fieldData.value}px`;
                        }
                        // Y-Axis
                        if (fieldNumber == 96) {
                            const vertical = `${fieldData.value}px`;
                            mainImg.style.objectPosition = `${horizontal} ${vertical}`;
                        }
                    }
                    // Template 9115 -----------------------------
                    if (templateNumber == 9115) {
                        processElement('f0_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        processElement('f2_gfx', layer1);
                        processElement('f3_gfx', layer1);
                        // Replace pipe with line break
                        for (let i = 0; i <= 3; i++) {
                            replacePipeWithBreak(i, layer1);
                        }
                        const leftImage = layer1.contentDocument.querySelector('.left-image');
                        // Main Img
                        if (fieldNumber == 80) {
                            if (fieldData.value) leftImage.src = fieldData.value;
                        }
                        // Zoom
                        if (fieldNumber == 94) {
                            leftImage.style.width = `${fieldData.value}%`;
                        }
                        // X-Axis
                        if (fieldNumber == 95) {
                            horizontal = `${fieldData.value}px`;
                        }
                        // Y-Axis
                        if (fieldNumber == 96) {
                            const vertical = `${fieldData.value}px`;
                            leftImage.style.objectPosition = `${horizontal} ${vertical}`;
                        }
                    }
                    // Template 9200 -----------------------------
                    if (templateNumber == 9200) {
                        processElement('f0_gfx', layer1);
                        processElement('f1_gfx', layer1);
                        processElement('f2_gfx', layer1);
                        processElement('f3_gfx', layer1);
                        processElement('f4_gfx', layer1);
                        processElement('f5_gfx', layer1);
                        processElement('f6_gfx', layer1);
                        processElement('f7_gfx', layer1);
                        processElement('f8_gfx', layer1);
                        processElement('f9_gfx', layer1);
                        processElement('f10_gfx', layer1);
                        processElement('f11_gfx', layer1);
                        processElement('f12_gfx', layer1);
                        processElement('f13_gfx', layer1);
                        const backgroundImg = layer1.contentDocument.querySelector('.background-img');
                        const flagImg = layer1.contentDocument.querySelector('.flag');
                        const cardBg = layer1.contentDocument.getElementById('font-bg');
                        const noteElements = layer1.contentDocument.querySelectorAll('.note');
                        const subNoteElements = layer1.contentDocument.querySelectorAll('.sub-note');
                        const noteContainer = layer1.contentDocument.querySelector('.note-box-container');
                        const nameContainer = layer1.contentDocument.querySelector('.name-container');
                        // Show / Hide Background
                        if (fieldNumber == 70) {
                            const backgroundStatus = fieldData.value;
                            if (backgroundStatus == "No Background") {
                                backgroundImg.style.display = "none";
                            } else {
                                backgroundImg.style.display = "initial";
                            }
                        }
                        // Show / Hide Card
                        if (fieldNumber == 71) {
                            const cardStatus = fieldData.value;
                            if (cardStatus == "No Card") {
                                cardBg.style.opacity = "0";
                            } else {
                                cardBg.style.opacity = "1";
                            }
                        }
                        // Flag Img
                        if (fieldNumber == 20) {
                            const fileList = flags;
                            const selectedFlagFile = fileList.find(flagItem => flagItem.slice(13, 16) == fieldData.value);
                            if (selectedFlagFile) {
                                flagImg.src = selectedFlagFile;
                            } else {
                                flagImg.src = "./9200/CBC.png";
                            }
                        }
                        // Note Container ---------------
                        // Replace pipe with line break
                        for (let i = 0; i <= 13; i++) {
                            replacePipeWithBreak(i, layer1);
                        }
                        // Y-Axis
                        if (fieldNumber == 91) {
                            noteContainer.style.bottom = `${fieldData.value}px`;
                        }
                        // Font Size Name / Note / Sub Note
                        if (fieldNumber == 88) {
                            let newFontSize = fieldData.value;
                            newFontSize = Math.max(20, Math.min(newFontSize, 200));
                            const ratio = newFontSize / 100;
                            const originalNameSize = 55;
                            nameContainer.style.fontSize = `${originalNameSize * ratio}px`;
                        }
                        if (fieldNumber == 92) {
                            let newFontSize = fieldData.value;
                            newFontSize = Math.max(20, Math.min(newFontSize, 200));
                            const ratio = newFontSize / 100;
                            const originalNoteSize = 33;
                            noteElements.forEach(element => {
                                element.style.fontSize = `${originalNoteSize * ratio}px`;
                            });
                        }
                        if (fieldNumber == 89) {
                            let newFontSize = fieldData.value;
                            newFontSize = Math.max(20, Math.min(newFontSize, 200));
                            const subNoteRatio = newFontSize / 100;
                            const originalSubNoteSize = 28;
                            subNoteElements.forEach(element => {
                                element.style.fontSize = `${originalSubNoteSize * subNoteRatio}px`;
                            });
                        }
                        // Line Height Note / Sub Note
                        if (fieldNumber == 93) {
                            let lineHeightInput = fieldData.value;
                            lineHeightInput = Math.max(20, Math.min(lineHeightInput, 200));
                            noteElements.forEach(element => {
                                element.style.lineHeight = `${lineHeightInput}%`;
                            });
                        }
                        if (fieldNumber == 90) {
                            let lineHeightInput = fieldData.value;
                            lineHeightInput = Math.max(20, Math.min(lineHeightInput, 200));
                            subNoteElements.forEach(element => {
                                element.style.lineHeight = `${lineHeightInput}%`;
                            });
                        }
                        // Background Img ---------------
                        // Source
                        if (fieldNumber == 81) {
                            backgroundImg.src = fieldData.value;
                        }
                        // Zoom
                        if (fieldNumber == 94) {
                            backgroundImg.style.width = `${fieldData.value}%`;
                        }
                        // X-Axis
                        if (fieldNumber == 95) {
                            horizontal = `${fieldData.value}px`;
                        }
                        // Y-Axis
                        if (fieldNumber == 96) {
                            const vertical = `${fieldData.value}px`;
                            backgroundImg.style.objectPosition = `${horizontal} ${vertical}`;
                        }
                        // Divider Toggle
                        if (fieldNumber == 87) {
                            const divider = layer1.contentDocument.querySelector('.divider');
                            let dividerStatus = fieldData.value;
                            if (dividerStatus !== "Divider") {
                                divider.style.display = "none";
                            } else {
                                divider.style.display = "initial";
                            }
                        }
                    }
                }
                // Find the corresponding div
                const fieldDiv = layer1.contentDocument.getElementById(fieldData.field + "_gfx");
                // If the div exists, set its text content
                if (fieldDiv) {
                    fieldDiv.textContent = fieldData.value;
                }
            });
        }
    }
}

function replacePipeWithBreak(fieldNumber, layer1) {
    if (layer1.contentDocument.getElementById(`f${fieldNumber}_gfx`)) {
        let text = layer1.contentDocument.getElementById(`f${fieldNumber}_gfx`).innerHTML;

        if (text.includes('|')) {
            text = text.replace(/\|/g, '<br />');
            layer1.contentDocument.getElementById(`f${fieldNumber}_gfx`).innerHTML = text;
        }
    }
}

function replaceSpacesWithNbsp(text) {
    return text.replace(/ /g, '&nbsp;');
}

// This helper function gets an element by its id and applies the transformations.
function processElement(id, layer1) {
    let element = layer1.contentDocument.getElementById(id);
    if (element) {
        let decodedText = element.innerHTML;
        let processedText = replaceSpacesWithNbsp(decodedText);
        element.innerHTML = processedText;
    }
}

function playServerAudio(sfx, message = '') {
    console.log('%cPlaying sound (' + sfx + ') on server. Log: ' + message + '.', 'background: #622; color: #fff');
    data = {};
    data.sound = sfx;
    data.info = message;
    ajaxpost('/gc/playaudio/', data)
} // playServerAudio

function working(StatusMsg) {
    if (!document.getElementById('working')) return; // not in controller
    if (StatusMsg == "") {
        document.getElementById('working').innerText = "";
        document.getElementById('working').style.display = "none";
    } else {
        document.getElementById('working').innerText = StatusMsg;
        document.getElementById('working').style.display = "inline-block";
    }
} //working

function toggleNormalRenderer(cmd) {
    // Added in 1.1.0
    // This [closing of popup] can happen in any SPX view,
    // not necessarily in the controller view...
    let Cfgdata = {};
    Cfgdata.key = 'renderer'
    if (cmd == 'open') {
        Cfgdata.val = 'popup';
    } else {
        Cfgdata.val = 'normal';
    }
    ajaxpost('/gc/saveConfigChanges', Cfgdata);
    showMessageSlider('Renderer changed to ' + Cfgdata.val + '.')

    if (!document.getElementById('previewIF')) return; // not in controller
    // if (cmd == 'open')  {
    //     // Hide inline renderer, use popup
    //     document.getElementById('previewBG').style.display='none';
    //     document.getElementById('previewIF').src='/templates/empty.html';
    // } else {
    //     // Use normal renderer
    //     document.getElementById('previewBG').style.display='block';
    //     document.getElementById('previewIF').src='/renderer?preview=true';
    // }
} // toggleNormalRenderer

// Initialize an array to hold the sequence of keys pressed
let keySequence = [];

document.addEventListener('keydown', function (event) {
    if (event.location === 3) { // Number pad keys
        if (event.key >= 0 && event.key <= 9) { // Number keys on the number pad
            keySequence.push(event.key); // Add the key to the sequence
            const numpadInput = document.getElementById('numpadValue');
            numpadInput.value = parseInt(keySequence.join('')).toString();
        } else if (event.key === 'Enter') { // Enter key on the number pad
            // Convert the key sequence to a number
            let enteredSequence = parseInt(keySequence.join(''));

            // Find the element with the matching data-spx-epoch attribute and focus on it
            let allRows = document.querySelectorAll('.itemrow');
            for (let i = 0; i < allRows.length; i++) {
                if (parseInt(allRows[i].getAttribute('data-spx-epoch')) === enteredSequence) {
                    focusRow(i);
                    break;
                }
            }

            // Reset the key sequence
            keySequence = [];
        }
    }
});

// Sort item array
let lastOrder = 'dsc'; // set it to 'dsc' so that the first sort will be 'asc'

function sortRundown() {
    // Get the container div
    const container = document.querySelector('#itemList');

    // Get all the divs inside the container except the last one
    let divs = Array.from(container.querySelectorAll('div'));
    const lastDiv = divs.pop(); // Remove the last div from the array and store it

    // Filter out divs without 'data-spx-epoch' attribute
    divs = divs.filter(div => div.hasAttribute('data-spx-epoch'));

    // Sort the divs based on the 'data-spx-epoch' attribute
    if (lastOrder === 'dsc') {
        divs.sort(function (a, b) {
            return parseInt(a.getAttribute('data-spx-epoch')) - parseInt(b.getAttribute('data-spx-epoch'));
        });
        lastOrder = 'asc';
    } else {
        divs.sort(function (a, b) {
            return parseInt(b.getAttribute('data-spx-epoch')) - parseInt(a.getAttribute('data-spx-epoch'));
        });
        lastOrder = 'dsc';
    }

    // Append the sorted divs back to the container
    for (let i = 0; i < divs.length; i++) {
        container.appendChild(divs[i]);
    }

    // Append the unrelated div back to the container
    container.appendChild(lastDiv);

    // Save Order
    SaveNewSortOrder();
}

// Slider number input functionality
let mouseDownStatus = false;
let oldX;
const sensitivity = .5; // change this to make the input more or less sensitive
const minVal = -1600;
const maxVal = 1600;
let target;

function mouseDown(e) {
    mouseDownStatus = true;
    oldX = e.pageX;
    target = e.target;
}

function mouseUp() {
    mouseDownStatus = false;
    target = null;
}

function mouseMove(e) {
    if (mouseDownStatus && target) {
        const newValue = parseInt(target.value, 10) + (e.pageX - oldX) / sensitivity;
        if (newValue < minVal) {
            target.value = minVal;
        } else if (newValue > maxVal) {
            target.value = maxVal;
        } else {
            target.value = newValue.toFixed();
        }
        oldX = e.pageX;
        checkChange(target);
    }
}

// Apply the mousemove and mouseup listener to the document
document.addEventListener('mousemove', mouseMove);
document.addEventListener('mouseup', mouseUp);

// iNews Related Logic ------------------------------------------------------------------------ //

// Get Access Token
async function getAccessToken() {
    const tokenExpiry = localStorage.getItem('cbcAccessTokenExpiry');
    const token = localStorage.getItem('cbcAccessToken');

    if (token && tokenExpiry && parseInt(tokenExpiry) > new Date().getTime()) {
        console.log('Token and expiry date are valid');
        return token;
    }

    console.log('Token is missing or expired, fetching a new one');

    try {
        const response = await fetch('http://localhost:3000/get-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch access token');
        }

        const responseData = await response.json();
        const accessToken = responseData.accessToken;
        const expiresIn = responseData.expiresIn;

        console.log('Saving the token and expiry date');
        localStorage.setItem('cbcAccessToken', accessToken);
        const expiryDate = new Date();
        expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);
        localStorage.setItem('cbcAccessTokenExpiry', expiryDate.getTime().toString());

        return accessToken;
    } catch (error) {
        console.error('Error fetching access token:', error);
        return null;
    }
}

let lineupChoiceGlobal = '';
let isNameOnlyGlobal = false;

// Fetch Data from iNews API
async function fetchData(lineupChoice, isNameOnly) {
    const token = await getAccessToken();
    const serverInput = document.getElementById('iNewsServer');
    const lineupInput1 = document.getElementById('iNewsLineup1');
    const lineupInput2 = document.getElementById('iNewsLineup2');
    const server = serverInput.value;
    const lineup1 = lineupInput1.value;
    const lineup2 = lineupInput2.value;
    let lineup = '';
    lineupChoiceGlobal = lineupChoice;
    isNameOnlyGlobal = isNameOnly;
    lineup = lineupChoice == 'lineup1' ? lineup1 : lineup2;
    if (!token) {
        console.log('No valid access token available');
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/fetch-data?token=${token}&server=${server}&lineup=${lineup}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch data from API');
        }

        const data = await response.json();
        const iNewsArray = [];
        data.payload.forEach(item => {
            const nsmlData = item.storyAsNsml;
            const parsedData = parseNsmlData(nsmlData);
            iNewsArray.push(parsedData);
        });
        // isUpdate ? getRundownForiNews(iNewsArray) : populateRundownForiNews(iNewsArray);
        populateRundownTable(iNewsArray);
    } catch (error) {
        console.error('Error fetching data from API:', error);
    }
}

let tableData = [];

function populateRundownTable(data) {
    let selectedCount = 0; // Track the number of selected checkboxes
    tableData = data;
    const tableElement = document.querySelector("#rundownTable");
    const pictureHeader = document.getElementById('pictureHeader');
    pictureHeader.style.display = lineupChoiceGlobal == 'lineup1' ? 'none' : 'table-cell';
    const tableBody = document.querySelector("#rundownTable tbody");
    tableBody.innerHTML = ""; // Clear existing rows

    // Create a div to display the selected count
    const countDisplay = document.getElementById("selectedCount") || document.createElement("div");
    countDisplay.id = "selectedCount";
    countDisplay.classList.add("selected-count");
    countDisplay.textContent = `Selected: ${selectedCount}`;
    tableElement.parentNode.insertBefore(countDisplay, tableElement);

    data.forEach((row, index) => {
        const tr = document.createElement("tr");
        tr.setAttribute("data-index", index);

        // Add a checkbox for selection
        const checkboxTd = document.createElement("td");
        const checkbox = document.createElement("input");
        checkboxTd.classList.add("select-column");
        checkbox.type = "checkbox";
        checkbox.classList.add("row-select");

        // Add an event listener to the checkbox
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                selectedCount++;
            } else {
                selectedCount--;
            }

            const rundownButton = document.getElementById('rundownItemBtn');
            if (selectedCount > 0) {
                rundownButton.disabled = false;
                rundownButton.className = 'btn bg_green';
            } else {
                rundownButton.disabled = true;
                rundownButton.className = 'btn button_disabled';
            }

            countDisplay.textContent = `Selected: ${selectedCount}`;

            // Disable all checkboxes if 10 are selected
            const allCheckboxes = document.querySelectorAll(".row-select");
            allCheckboxes.forEach(cb => {
                if (selectedCount >= 10) {
                    if (!cb.checked) {
                        cb.disabled = true;
                    }
                } else {
                    cb.disabled = false;
                }
            });
        });

        checkboxTd.appendChild(checkbox);
        tr.appendChild(checkboxTd);

        // Add data columns
        let columns = [];
        columns = lineupChoiceGlobal == 'lineup1' ? ["name", "message"] : ["name", "message", "picture"];
        columns.forEach(key => {
            const td = document.createElement("td");
            td.textContent = row[key] || ""; // Add a fallback for empty values
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });

    tableElement.style.opacity = "1";
}

function getSelectedRows() {
    const selectedRows = [];
    const checkboxes = document.querySelectorAll(".row-select:checked");

    checkboxes.forEach(checkbox => {
        const row = checkbox.closest("tr");
        const rowIndex = parseInt(row.getAttribute("data-index"), 10); // Read the assigned index
        selectedRows.push(tableData[rowIndex]); // Use tableData to fetch the corresponding object
    });

    return selectedRows;
}

function createRundownItem() {
    const selectedRows = getSelectedRows();

    if (!selectedRows.length) {
        alert("No rows selected.");
        return;
    }

    getRundownForiNews(selectedRows);
}


// Parse NSML
function parseNsmlData(nsmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(nsmlString, 'application/xml');

    const nameNode = xmlDoc.querySelector('string[id="name"]');
    const messageNode = xmlDoc.querySelector('string[id="messages"]');
    const pictureNode = xmlDoc.querySelector('string[id="slideshow"]');

    const name = nameNode ? nameNode.textContent : '';
    const message = messageNode ? messageNode.textContent : '';
    const picture = pictureNode ? pictureNode.textContent : '';

    return { name, message, picture };
}

// Get Rundown
function getRundownForiNews(iNewsArray) {
    axios.get('http://localhost:5656/api/v1/rundown/get')
        .then(response => {
            const existingRundown = response.data;
            updateRundownForiNews(existingRundown, iNewsArray);
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Update Rundown
function updateRundownForiNews(existingRundown, iNewsArray) {
    const data = {
        project: "NYE",
        file: "NYE",
        content: existingRundown
    };

    let templateCount = 0;
    if (existingRundown.templates.length) templateCount = (existingRundown.templates.length + 1);

    let currentID = Math.floor(Math.random() * 90000) + 10000;
    itemID = currentID.toString();

    const templateMessages = {
        defversion: "1",
        description: "Lower Third Messages",
        playserver: "OVERLAY",
        playchannel: "2",
        playlayer: "9",
        webplayout: "9",
        out: "manual",
        dataformat: "json",
        uicolor: "1",
        DataFields: [
            {
                field: "f81",
                ftype: "textfield",
                title: "Transition (s)",
                value: "10"
            },
            ...Array.from({ length: 10 }, (_, i) => ({
                ftype: "caption",
                value: `Item ${i + 1}`
            })).flatMap((caption, i) => [
                caption,
                {
                    field: `f${2 + i * 6}`, // Adjust field number dynamically
                    ftype: "textfield",
                    title: "Name",
                    value: iNewsArray[i]?.name ?? "" // Safe access with a default value
                },
                {
                    field: `f${3 + i * 6}`, // Adjust field number dynamically
                    ftype: "textfield",
                    title: "Message",
                    value: iNewsArray[i]?.message ?? "" // Safe access with a default value
                },
                {
                    ftype: "divider"
                }
            ]),
            {
                field: "f67",
                ftype: "hidden",
                title: "Total Out",
                value: "manual"
            },
            {
                field: "f68",
                ftype: "checkbox",
                title: "Loop Graphic",
                value: "1"
            }
        ],
        onair: "false",
        imported: Date.now().toString(),
        relpath: "/NYE/L3_MESSAGES.html",
        itemID: itemID
    };

    const templateSlideshow = {
        defversion: "1",
        description: "Lower Third Slideshow",
        playserver: "OVERLAY",
        playchannel: "2",
        playlayer: "18",
        webplayout: "18",
        out: "manual",
        dataformat: "json",
        uicolor: "5",
        DataFields: [
            {
                field: "f81",
                ftype: "textfield",
                title: "Transition (s)",
                value: "10"
            },
            ...Array.from({ length: 10 }, (_, i) => ({
                ftype: "caption",
                value: `Item ${i + 1}`
            })).flatMap((caption, i) => [
                caption,
                {
                    field: `f${2 + i * 6}`, // Adjust field number dynamically
                    ftype: "textfield",
                    title: "Name",
                    value: iNewsArray[i]?.name ?? "" // Safe access with a default value
                },
                {
                    field: `f${3 + i * 6}`, // Adjust field number dynamically
                    ftype: "textfield",
                    title: "Message",
                    value: iNewsArray[i]?.message ?? "" // Safe access with a default value
                },
                {
                    field: `f${4 + i * 6}`, // Adjust field number dynamically
                    ftype: "textfield",
                    title: "Picture",
                    value: iNewsArray[i]?.picture ?? "" // Safe access with a default value
                },
                {
                    ftype: "divider"
                }
            ]),
            {
                field: "f67",
                ftype: "hidden",
                title: "Total Out",
                value: "manual"
            },
            {
                field: "f68",
                ftype: "checkbox",
                title: "Loop Graphic",
                value: "1"
            }
        ],
        onair: "false",
        imported: Date.now().toString(),
        relpath: "/NYE/L3_SLIDESHOW.html",
        itemID: itemID
    };

    const templateSlideshowNameOnly = {
        defversion: "1",
        description: "Lower Third Slideshow Name Only",
        playserver: "OVERLAY",
        playchannel: "2",
        playlayer: "18",
        webplayout: "18",
        out: "manual",
        dataformat: "json",
        uicolor: "5",
        DataFields: [
            {
                field: "f81",
                ftype: "textfield",
                title: "Transition (s)",
                value: "10"
            },
            ...Array.from({ length: 10 }, (_, i) => ({
                ftype: "caption",
                value: `Item ${i + 1}`
            })).flatMap((caption, i) => [
                caption,
                {
                    field: `f${2 + i * 6}`, // Adjust field number dynamically
                    ftype: "textfield",
                    title: "Name",
                    value: iNewsArray[i]?.name ?? "" // Safe access with a default value
                },
                {
                    field: `f${4 + i * 6}`, // Adjust field number dynamically
                    ftype: "textfield",
                    title: "Picture",
                    value: iNewsArray[i]?.picture ?? "" // Safe access with a default value
                },
                {
                    ftype: "divider"
                }
            ]),
            {
                field: "f67",
                ftype: "hidden",
                title: "Total Out",
                value: "manual"
            },
            {
                field: "f68",
                ftype: "checkbox",
                title: "Loop Graphic",
                value: "1"
            }
        ],
        onair: "false",
        imported: Date.now().toString(),
        relpath: "/NYE/L3_SLIDESHOW_NAME_ONLY.html",
        itemID: itemID
    };

    let template;
    if (lineupChoiceGlobal == 'lineup1') {
        template = templateMessages;
    } else if (isNameOnlyGlobal) {
        template = templateSlideshowNameOnly;
    } else {
        template = templateSlideshow;
    }
    data.content.templates.push(template);

    axios.post('http://localhost:5656/api/v1/rundown/json', data)
        .then(response => {
            console.log('populate rundown', response.data);
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Populate Rundown
function populateRundownForiNews(iNewsArray) {
    const data = {
        project: "Demo",
        file: "Demo",
        content: {
            comment: "Sent from iNews",
            templates: []
        }
    };

    iNewsArray.forEach((item, index) => {
        const template = {
            defversion: "1",
            description: "News Test",
            playserver: "OVERLAY",
            playchannel: "1",
            playlayer: "10",
            webplayout: "10",
            out: "manual",
            dataformat: "json",
            uicolor: "0",
            DataFields: [
                {
                    field: "f1",
                    ftype: "textfield",
                    title: "Header",
                    value: "Financial Institutions can now offer tax-free home savings accounts"
                },
                {
                    field: "f2",
                    ftype: "textfield",
                    title: "Title",
                    value: item.name
                },
                {
                    field: "f3",
                    ftype: "textfield",
                    title: "Sub-Title",
                    value: item.title
                },
                {
                    field: "f4",
                    ftype: "textfield",
                    title: "Footer",
                    value: "Over 32% of eligible Islanders vote in advance polls for PEI election"
                }
            ],
            onair: "false",
            imported: Date.now().toString(),
            relpath: "/news/NEWS_TEST.html",
            itemID: (index + 1).toString().padStart(5, '0')
        };

        data.content.templates.push(template);
    });

    axios.post('http://localhost:5656/api/v1/rundown/json', data)
        .then(response => {
            console.log('populate rundown', response.data);
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// End of iNews Related Logic ----------------------------------------------------------------- //

// Play All Logic ----------------------------------------------------------------------------- //

let savedRundown;

// Get Rundown
function getRundownPlayAll() {
    clearAllTimeouts();
    axios.get('http://localhost:5656/api/v1/rundown/get')
        .then(response => {
            let existingRundown;
            if (response.data) {
                existingRundown = response.data;
                savedRundown = existingRundown;
                parseRundown(existingRundown);
            } else {
                parseRundown(savedRundown);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

let timeouts = [];

// Parse Rundown to get out timings
function parseRundown(rundown) {
    console.log(rundown);
    const outTimeArray = [];
    rundown.templates.forEach((template) => {
        let outTimeString = '';
        if (template.out) {
            if (template.out !== 'manual') {
                outTimeString = template.out;
            } else {
                outTimeString = '60000';
            }
            const outTime = +outTimeString;
            outTimeArray.push(outTime);
        }
    });

    const totalOutTime = outTimeArray.reduce((sum, outTime) => sum + outTime, 0);
    populateRundownTime(totalOutTime);
    console.log(totalOutTime, outTimeArray);

    // Start the recursive playback
    playNextItemSequentially(outTimeArray, 0, totalOutTime);
}

// Populate Input with Total Out Time
function populateRundownTime(totalOutTime) {
    // const totalOutTimeSeconds = (totalOutTime / 1000) + 61;
    // const roundedOutTimeSeconds = Math.round(totalOutTimeSeconds);
    // const rundownTimeInput = document.getElementById('rundownTotalTime');
    // rundownTimeInput.value = roundedOutTimeSeconds;
}

// Play Next Items in order
function playNextItemSequentially(outTimeArray, index, totalOutTime) {
    if (index === 0) {
        focusFirstControl();
        const timeoutIdStart = setTimeout(() => {
            playFocused();
        }, 100);
        timeouts.push(timeoutIdStart);
    }

    if (index <= outTimeArray.length) {
        const timeoutId = setTimeout(() => {
            playNextItemControl();
            playNextItemSequentially(outTimeArray, index + 1, totalOutTime);
        }, outTimeArray[index]);
        timeouts.push(timeoutId);
    } else {
        clearAllTimeouts();
        // Restart the sequence immediately
        stopFocused();
        const timeoutId = setTimeout(() => {
            playNextItemSequentially(outTimeArray, 0, totalOutTime);
        }, 1700);
        timeouts.push(timeoutId);
    }
    console.log(timeouts);
}

function playNextItemControl() {
    stopFocused();
    let timeoutIdAlt;
    const timeoutId = setTimeout(() => {
        focusNextControl();
        timeoutIdAlt = setTimeout(() => {
            playFocused();
        }, 100);
        timeouts.push(timeoutIdAlt);
    }, 1700);
    timeouts.push(timeoutId);
}

// Function to clear all timeouts
function clearAllTimeouts() {
    timeouts.forEach(clearTimeout);
    timeouts = [];
}
// Play All
function playAllControl() {
    getRundownPlayAll();
}

// Focus First
function focusFirstControl() {
    axios.get('http://localhost:5656/api/v1/rundown/focusFirst')
        .then(response => {
            console.log('Focus First');
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Focus Next
function focusNextControl() {
    axios.get('http://localhost:5656/api/v1/rundown/focusNext')
        .then(response => {
            console.log('Focus Next');
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Play Focused
function playFocused() {
    axios.get('http://localhost:5656/api/v1/item/play')
        .then(response => {
            console.log('Play Focused');
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Stop Focused
function stopFocused() {
    axios.get('http://localhost:5656/api/v1/item/stop')
        .then(response => {
            console.log('Stop Focused');
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Flags Reference List
const flags = [
    './9000/flags/AB.png',
    './9000/flags/AFG.png',
    './9000/flags/AIN.png',
    './9000/flags/ALB.png',
    './9000/flags/ALG.png',
    './9000/flags/AND.png',
    './9000/flags/ANG.png',
    './9000/flags/ANT.png',
    './9000/flags/ARG.png',
    './9000/flags/ARM.png',
    './9000/flags/ARU.png',
    './9000/flags/ASA.png',
    './9000/flags/AUS.png',
    './9000/flags/AUT.png',
    './9000/flags/AZE.png',
    './9000/flags/BAH.png',
    './9000/flags/BAN.png',
    './9000/flags/BAR.png',
    './9000/flags/BC.png',
    './9000/flags/BDI.png',
    './9000/flags/BEL.png',
    './9000/flags/BEN.png',
    './9000/flags/BER.png',
    './9000/flags/BHU.png',
    './9000/flags/BIH.png',
    './9000/flags/BIZ.png',
    './9000/flags/BLR.png',
    './9000/flags/BOC.png',
    './9000/flags/BOL.png',
    './9000/flags/BOT.png',
    './9000/flags/BRA.png',
    './9000/flags/BRN.png',
    './9000/flags/BRU.png',
    './9000/flags/BUL.png',
    './9000/flags/BUR.png',
    './9000/flags/CAF.png',
    './9000/flags/CAM.png',
    './9000/flags/CAN.png',
    './9000/flags/CAY.png',
    './9000/flags/CBC.png',
    './9000/flags/CGO.png',
    './9000/flags/CHA.png',
    './9000/flags/CHI.png',
    './9000/flags/CHN.png',
    './9000/flags/CIV.png',
    './9000/flags/CLN.png',
    './9000/flags/CMR.png',
    './9000/flags/COD.png',
    './9000/flags/COK.png',
    './9000/flags/COL.png',
    './9000/flags/COM.png',
    './9000/flags/COR.png',
    './9000/flags/CPV.png',
    './9000/flags/CRC.png',
    './9000/flags/CRO.png',
    './9000/flags/CUB.png',
    './9000/flags/CYP.png',
    './9000/flags/CZE.png',
    './9000/flags/DEN.png',
    './9000/flags/DJI.png',
    './9000/flags/DMA.png',
    './9000/flags/DOM.png',
    './9000/flags/ECU.png',
    './9000/flags/EGY.png',
    './9000/flags/EOR.png',
    './9000/flags/ERI.png',
    './9000/flags/ESA.png',
    './9000/flags/ESP.png',
    './9000/flags/EST.png',
    './9000/flags/ETH.png',
    './9000/flags/FIJ.png',
    './9000/flags/FIN.png',
    './9000/flags/FRA.png',
    './9000/flags/FSM.png',
    './9000/flags/GAB.png',
    './9000/flags/GAM.png',
    './9000/flags/GBR.png',
    './9000/flags/GBS.png',
    './9000/flags/GDR.png',
    './9000/flags/GEO.png',
    './9000/flags/GEQ.png',
    './9000/flags/GER.png',
    './9000/flags/GHA.png',
    './9000/flags/GRE.png',
    './9000/flags/GRN.png',
    './9000/flags/GUA.png',
    './9000/flags/GUI.png',
    './9000/flags/GUM.png',
    './9000/flags/GUY.png',
    './9000/flags/HAI.png',
    './9000/flags/HKG.png',
    './9000/flags/HON.png',
    './9000/flags/HUN.png',
    './9000/flags/INA.png',
    './9000/flags/IND.png',
    './9000/flags/IOA.png',
    './9000/flags/IOC.png',
    './9000/flags/IOP.png',
    './9000/flags/IPA.png',
    './9000/flags/IPC.png',
    './9000/flags/IPP.png',
    './9000/flags/IRI.png',
    './9000/flags/IRL.png',
    './9000/flags/IRQ.png',
    './9000/flags/ISL.png',
    './9000/flags/ISR.png',
    './9000/flags/ISV.png',
    './9000/flags/ITA.png',
    './9000/flags/IVB.png',
    './9000/flags/JAM.png',
    './9000/flags/JOR.png',
    './9000/flags/JPN.png',
    './9000/flags/KAZ.png',
    './9000/flags/KEN.png',
    './9000/flags/KGZ.png',
    './9000/flags/KIR.png',
    './9000/flags/KOR.png',
    './9000/flags/KOS.png',
    './9000/flags/KSA.png',
    './9000/flags/KUW.png',
    './9000/flags/LAO.png',
    './9000/flags/LAT.png',
    './9000/flags/LBA.png',
    './9000/flags/LBN.png',
    './9000/flags/LBR.png',
    './9000/flags/LCA.png',
    './9000/flags/LES.png',
    './9000/flags/LIE.png',
    './9000/flags/LTU.png',
    './9000/flags/LUX.png',
    './9000/flags/MAD.png',
    './9000/flags/MAR.png',
    './9000/flags/MAS.png',
    './9000/flags/MAW.png',
    './9000/flags/MB.png',
    './9000/flags/MDA.png',
    './9000/flags/MDV.png',
    './9000/flags/MEX.png',
    './9000/flags/MGL.png',
    './9000/flags/MHL.png',
    './9000/flags/MKD.png',
    './9000/flags/MLI.png',
    './9000/flags/MLT.png',
    './9000/flags/MNE.png',
    './9000/flags/MON.png',
    './9000/flags/MOZ.png',
    './9000/flags/MRI.png',
    './9000/flags/MTN.png',
    './9000/flags/MYA.png',
    './9000/flags/NAM.png',
    './9000/flags/NB.png',
    './9000/flags/NCA.png',
    './9000/flags/NED.png',
    './9000/flags/NEP.png',
    './9000/flags/NGR.png',
    './9000/flags/NIG.png',
    './9000/flags/NL.png',
    './9000/flags/NOR.png',
    './9000/flags/NPA.png',
    './9000/flags/NRU.png',
    './9000/flags/NS.png',
    './9000/flags/NT.png',
    './9000/flags/NU.png',
    './9000/flags/NZL.png',
    './9000/flags/OAR.png',
    './9000/flags/OMA.png',
    './9000/flags/ON.png',
    './9000/flags/PAK.png',
    './9000/flags/PAN.png',
    './9000/flags/PAR.png',
    './9000/flags/PE.png',
    './9000/flags/PER.png',
    './9000/flags/PHI.png',
    './9000/flags/PLE.png',
    './9000/flags/PLW.png',
    './9000/flags/PNG.png',
    './9000/flags/POL.png',
    './9000/flags/POR.png',
    './9000/flags/PRK.png',
    './9000/flags/PUR.png',
    './9000/flags/QAT.png',
    './9000/flags/QC.png',
    './9000/flags/ROC.png',
    './9000/flags/ROT.png',
    './9000/flags/ROU.png',
    './9000/flags/RPC.png',
    './9000/flags/RSA.png',
    './9000/flags/RUS.png',
    './9000/flags/RWA.png',
    './9000/flags/SAM.png',
    './9000/flags/SEN.png',
    './9000/flags/SEY.png',
    './9000/flags/SGP.png',
    './9000/flags/SK.png',
    './9000/flags/SKN.png',
    './9000/flags/SLE.png',
    './9000/flags/SLO.png',
    './9000/flags/SMR.png',
    './9000/flags/SOL.png',
    './9000/flags/SOM.png',
    './9000/flags/SRB.png',
    './9000/flags/SRI.png',
    './9000/flags/SSD.png',
    './9000/flags/STP.png',
    './9000/flags/SUD.png',
    './9000/flags/SUI.png',
    './9000/flags/SUR.png',
    './9000/flags/SVK.png',
    './9000/flags/SWE.png',
    './9000/flags/SWZ.png',
    './9000/flags/SYR.png',
    './9000/flags/TAH.png',
    './9000/flags/TAN.png',
    './9000/flags/TBD.png',
    './9000/flags/TGA.png',
    './9000/flags/THA.png',
    './9000/flags/TJK.png',
    './9000/flags/TKM.png',
    './9000/flags/TLS.png',
    './9000/flags/TOG.png',
    './9000/flags/TPE.png',
    './9000/flags/TTO.png',
    './9000/flags/TUN.png',
    './9000/flags/TUR.png',
    './9000/flags/TUV.png',
    './9000/flags/UAE.png',
    './9000/flags/UGA.png',
    './9000/flags/UKR.png',
    './9000/flags/URS.png',
    './9000/flags/URU.png',
    './9000/flags/USA.png',
    './9000/flags/UZB.png',
    './9000/flags/VAN.png',
    './9000/flags/VEN.png',
    './9000/flags/VIE.png',
    './9000/flags/VIN.png',
    './9000/flags/YEM.png',
    './9000/flags/YT.png',
    './9000/flags/YUG.png',
    './9000/flags/ZAM.png',
    './9000/flags/ZIM.png'
];
