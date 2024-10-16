module.exports = function (steward) {
    // ---------Keys of the plugin---------
    const KEY_ATTACH = 'taba';
    const KEY_DETACH = 'tabd';
    const KEY_FOCUS = 'tabf';

    // ---------Text of the plugin---------
    // before input
    const TITLE = '管理标签页与窗口';

    const TITLE_ATTACH = '合并标签页';
    const TITLE_DETACH = '移动标签页';
    const TITLE_FOCUS = '跳转到标签页';
    const SUBTITLE_ATTACH = '合并标签页';
    const SUBTITLE_DETACH = '查找并移动一个标签页到指定的窗口';
    const SUBTITLE_FOCUS = '跳转到标签页';
    // on query
    const UNKNOW_TAB_TITLE = '[未知标题新标签页或设置页面]'; // any

    const TITLE_NOTHING_TO_ATTACH = '当前只有一个窗口';
    const SUBTITLE_NOTHING_TO_ATTACH = '当前只有一个窗口';
    const TITLE_ATTACH_ALL = '合并所有标签页';
    const SUBTITLE_ATTACH_ALL = '将所有标签页合并到当前窗口';
    const SUBTITLE_ATTACH_WIN = '移动标签页到当前窗口';
    const SUBTITLE_ATTACH_TAB = '合并此窗口的所有标签页';

    const TITLE_DETACH_TO_NEW = '新窗口';
    const SUBTITLE_DETACH_TO_NEW = '移动到新窗口';
    const SUBTITLE_DETACH_TO = '移动到此窗口';

    // -------Plugin Core Functions--------
    function FormatData(list, command) {
        return list.map(item => {
            return {
                key: command.key,
                id: item.id,
                icon: item.favIconUrl ?? PLUGIN_ICON,
                title: item.title ?? UNKNOW_TAB_TITLE,
                desc: command.subtitle,
                isWarn: item.active,
                raw: item
            }
        });
    }

    /**
     * 
     * @param {*} method chrome.windows.{method}
     * @returns 
     */
    function WindowsOnPromise(method) {
        return new Promise(r => method({ populate: true }, w => r(w)));
    }

    async function asyncQueryTab(query, filter) {
        let tabs = (await WindowsOnPromise(chrome.windows.getAll))
            .reduce((memo, win) => {
                memo.push(...win.tabs)
                return memo;
            }, []);
        if (filter) tabs = tabs.filter(filter);
        return tabs.filter(tab => {
            return steward.util.matchText(query, `${tab.title}${tab.url}`);
        });
    }

    async function asyncQueryWindow(query, desc) {
        const current = (await WindowsOnPromise(chrome.windows.getCurrent)).id;
        return (await WindowsOnPromise(chrome.windows.getAll)).filter(win => {
            if (win.id === current) return false;
            const tab = win.tabs.filter(tab => tab.active).pop();
            return steward.util.matchText(query, `${tab.title}${tab.url}`)
        }).map(win => {
            const tab = win.tabs.filter(tab => tab.active).pop();
            return {
                id: win.id,
                icon: tab.favIconUrl ?? PLUGIN_ICON,
                title: tab.title ?? UNKNOW_TAB_TITLE,
                desc: desc,
                tabId: tab.id,
                tabIndex: win.tabs.length - 1
            };
        });
    }

    function UpdateTab(id, updateProperties, windowId) {
        if (updateProperties.active) {
            chrome.windows.update(windowId, { focused: true });
        }
        return chrome.tabs.update(id, updateProperties);
    }

    async function asyncOnAttachInput(query) {
        const winResults = await asyncQueryWindow(query, SUBTITLE_ATTACH_TAB);
        const current = (await WindowsOnPromise(chrome.windows.getCurrent)).id;
        const tabs = await asyncQueryTab(query, tab => tab.windowId !== current);
        // default: attach all
        let results = COMMAND_ATTACH.default;
        tabs.forEach(tab => results[0].id.push(tab.id));
        // attach window
        winResults.forEach(r => {
            r.windowId = r.id;
            r.id = [];
        });
        tabs.forEach(
            tab => winResults.filter(r => r.windowId === tab.windowId).forEach(
                r => r.id.push(tab.id)
            )
        );
        winResults.forEach(r => {
            r.title += ` [ +${r.id.length - 1} 个标签页]`;
        });
        results = results.concat(winResults.filter(r => r.id.length > 1));
        // attach tab
        tabs.forEach(tab => {
            const tabResults = FormatData([tab], COMMAND_ATTACH);
            tabResults.forEach(r => {
                r.desc = SUBTITLE_ATTACH_WIN;
                r.id = [r.id];
            });
            results = results.concat(tabResults);
        });
        if (results.length === 1) {
            results[0].title = TITLE_NOTHING_TO_ATTACH;
            results[0].desc = SUBTITLE_NOTHING_TO_ATTACH;
        }
        return results;
    }

    async function asyncOnDetachInput(query) {
        return COMMAND_DETACH.default.concat(await asyncQueryWindow(query, SUBTITLE_DETACH_TO));
    }

    async function asyncOnFocusInput(query) {
        const activeTabID = (await WindowsOnPromise(chrome.windows.getCurrent)).tabs.filter(tab => tab.active).pop().id;
        const filter = tab => tab.id !== activeTabID;
        return FormatData(await asyncQueryTab(query, filter), COMMAND_FOCUS);
    }

    function onAttach(item) {
        if (item.length === 1) {
            return;
        }
        chrome.windows.getCurrent({ populate: true }, current => {
            item.id.forEach(tabId => {
                chrome.tabs.move(tabId, { windowId: current.id, index: current.tabs.length + 1 }, console.log);
            })
            steward.app.refresh();
        })
    }

    function onDetach(item) {
        async function asyncMoveTabs() {
            (await WindowsOnPromise(chrome.windows.getCurrent)).tabs.filter(tab => tab.highlighted && tab.id >= 0).forEach(tab => {
                chrome.tabs.move(
                    tab.id,
                    { windowId: item.id, index: item.tabIndex++ },
                    console.log
                );
                UpdateTab(tab.id, { active: true }, item.id);
                steward.app.refresh();
            })
        }
        if (item.id) {
            asyncMoveTabs();
            return;
        }
        chrome.windows.create(null, window => {
            const holder = window.tabs[0].id;
            item.id = window.id;
            item.tabIndex = 0;
            asyncMoveTabs();
            chrome.tabs.remove(holder);
        });
    }

    function onFocus(item) {
        UpdateTab(item.id, { active: true }, item.raw.windowId);
        steward.app.refresh();
    }

    // CONSTANTS
    const VERSION = 1;
    const AUTHOR = 'WayneFerdon';
    const PLUGIN_NAME = 'Tab Pro';
    const PLUGIN_TYPE = 'keyword';
    const PLUGIN_CATEGORY = 'browser';
    // const PLUGIN_ICON = 'https://i.imgur.com/QcoukjA.png';
    const PLUGIN_ICON = './iconfont/tab.svg';
    const COMMAND_ATTACH = {
        key: KEY_ATTACH,
        type: PLUGIN_TYPE,
        title: TITLE_ATTACH,
        subtitle: SUBTITLE_ATTACH,
        icon: PLUGIN_ICON,
        onEnter: onAttach,
        onInput: asyncOnAttachInput,
        default: [
            {
                key: KEY_ATTACH,
                icon: PLUGIN_ICON,
                title: TITLE_ATTACH_ALL,
                desc: SUBTITLE_ATTACH_ALL,
                id: [],
            }
        ]
    }
    const COMMAND_DETACH = {
        key: KEY_DETACH,
        type: PLUGIN_TYPE,
        title: TITLE_DETACH,
        subtitle: SUBTITLE_DETACH,
        icon: PLUGIN_ICON,
        onEnter: onDetach,
        onInput: asyncOnDetachInput,
        default: [
            {
                key: KEY_DETACH,
                icon: PLUGIN_ICON,
                title: TITLE_DETACH_TO_NEW,
                desc: SUBTITLE_DETACH_TO_NEW
            }
        ]
    }
    const COMMAND_FOCUS = {
        key: KEY_FOCUS,
        type: PLUGIN_TYPE,
        title: TITLE_FOCUS,
        subtitle: SUBTITLE_FOCUS,
        icon: PLUGIN_ICON,
        onEnter: onFocus,
        onInput: asyncOnFocusInput
    }

    return {
        author: AUTHOR,
        version: VERSION,
        name: PLUGIN_NAME,
        category: PLUGIN_CATEGORY,
        icon: PLUGIN_ICON,
        title: TITLE,
        commands: [COMMAND_ATTACH, COMMAND_DETACH, COMMAND_FOCUS],
        onInput: (query, command) => { return command.onInput(query) },
        onEnter: (item, command, query, { shiftKey }, list) => command.onEnter(item)
    };
}
