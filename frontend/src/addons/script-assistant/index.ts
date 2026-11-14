/**
 * Script Assistant (SwissCirkus fork): an opt-in add-on, like the others.
 *
 * A right-sidebar panel that reads the whole script and rewrites, adds or
 * removes scenes on request — applying notes from a Google Doc, turning an
 * outline into scenes — on Kontroll's own AI models, through the Kontroll
 * bridge (services/kontrollBridge.ts). Inside Kontroll it is turned on for the
 * writer the first time; in a plain browser the panel says it needs Kontroll.
 */
import { t } from '../../i18n';
import type { OpenDraftPlugin } from '../../plugins/registry';
import { PLUGIN_PANEL_OPEN_EVENT } from '../../components/PluginPanelTabs';
import ScriptAssistantPanel from './ScriptAssistantPanel';

export const SCRIPT_ASSISTANT_ID = 'script-assistant';
export const SCRIPT_ASSISTANT_PANEL = 'script-assistant-panel';

const scriptAssistant: OpenDraftPlugin = {
  id: SCRIPT_ASSISTANT_ID,
  get name() { return t('addons:scriptAssistant.plugin.name'); },
  version: '1.0.0',
  optIn: true,
  get description() { return t('addons:scriptAssistant.plugin.description'); },
  get privacy() { return t('addons:scriptAssistant.plugin.privacy'); },
  panels: [
    { id: SCRIPT_ASSISTANT_PANEL, slot: 'right-sidebar', get label() { return t('addons:scriptAssistant.plugin.panel'); }, component: ScriptAssistantPanel },
  ],
  menuItems: [
    {
      id: 'script-assistant-open',
      section: 'Tools',
      get label() { return t('addons:scriptAssistant.plugin.menu'); },
      action: () => document.dispatchEvent(
        new CustomEvent(PLUGIN_PANEL_OPEN_EVENT, { detail: { panelId: SCRIPT_ASSISTANT_PANEL } }),
      ),
    },
  ],
};

export default scriptAssistant;
