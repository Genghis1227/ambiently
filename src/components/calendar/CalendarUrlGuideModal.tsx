import React, { useState, useEffect } from 'react';
import { X, Calendar, ExternalLink, Check, Copy, AlertTriangle, ShieldCheck } from 'lucide-react';

interface CalendarUrlGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProviderTab = 'google' | 'apple' | 'outlook';

export const CalendarUrlGuideModal: React.FC<CalendarUrlGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<ProviderTab>('google');
  const [copiedExample, setCopiedExample] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyExample = () => {
    navigator.clipboard.writeText(
      'https://calendar.google.com/calendar/ical/your_name%40gmail.com/private-1234567890abcdef/basic.ics'
    );
    setCopiedExample(true);
    setTimeout(() => setCopiedExample(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden cursor-default animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 p-4 bg-gray-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">
                How to Find Your Calendar URL
              </h2>
              <p className="text-[11px] text-gray-400">
                Connect Google, Apple, or Outlook iCal feeds (.ics)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="flex items-center gap-1 px-4 pt-2 border-b border-gray-800 bg-gray-950/40 shrink-0">
          {[
            { id: 'google' as const, label: 'Google Calendar' },
            { id: 'apple' as const, label: 'Apple iCloud' },
            { id: 'outlook' as const, label: 'Microsoft Outlook' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400 bg-gray-900/80'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-gray-300">
          {activeTab === 'google' && (
            <div className="space-y-4">
              {/* Highlight Notice */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-emerald-200/90 leading-relaxed">
                  <strong className="text-emerald-300 block mb-0.5 font-semibold">
                    Keep Your Calendar Private:
                  </strong>
                  Google provides a <strong>Secret address in iCal format</strong> so Ambiently can securely sync your personal schedule without making your calendar public to the internet!
                </div>
              </div>

              {/* Step by Step */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-white">Open Google Calendar in a Web Browser</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Go to{' '}
                      <a
                        href="https://calendar.google.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        calendar.google.com <ExternalLink className="w-2.5 h-2.5" />
                      </a>{' '}
                      on your computer or tablet (settings are not accessible via the mobile phone app).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-white">Go to Settings &gt; Settings for my calendars</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      In the top right corner, click <strong>Settings (gear icon) &gt; Settings</strong>. On the left panel, find <strong>&quot;Settings for my calendars&quot;</strong> and click the name of your calendar (or hover over your calendar in the sidebar, click <strong>⋮</strong>, and choose <strong>Settings and sharing</strong>).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-white">Click &quot;Integrate calendar&quot;</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      In the calendar settings menu, click <strong>Integrate calendar</strong> (or scroll down to that section).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <p className="font-semibold text-white">Copy &quot;Secret address in iCal format&quot;</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Click the copy icon next to <strong>Secret address in iCal format</strong>.
                    </p>
                    <div className="mt-2 p-2 rounded-lg bg-gray-950 border border-gray-800 flex items-center justify-between text-[10px] font-mono text-gray-400">
                      <span className="truncate pr-2">
                        https://calendar.google.com/calendar/ical/.../basic.ics
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyExample}
                        className="text-blue-400 hover:text-blue-300 shrink-0 font-sans font-medium flex items-center gap-1 cursor-pointer"
                      >
                        {copiedExample ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedExample ? 'Copied' : 'Copy Example'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    5
                  </span>
                  <div>
                    <p className="font-semibold text-white">Paste into Ambiently & Click Add Feed</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Paste the copied address into the URL input and click <strong>Add Feed</strong>. Your schedule will sync live automatically!
                    </p>
                  </div>
                </div>
              </div>

              {/* Common Pitfall Alert */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-[11px] text-amber-200/90 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Common Mistake:</strong> Do not copy the URL from your browser address bar (such as <code>calendar.google.com/calendar/u/0/r</code>). That is the web app page, not an iCal feed. Only URLs ending in <code>.ics</code> will sync.
                </div>
              </div>

              {/* Official Google Documentation Links */}
              <div className="p-3 rounded-xl bg-gray-950/80 border border-gray-800 text-[11px] space-y-1.5">
                <p className="font-semibold text-gray-200">Official Google Support Documentation:</p>
                <div className="space-y-1">
                  <a
                    href="https://support.google.com/calendar/answer/37648?hl=en"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span>See your Google Calendar in other programs (Google Help)</span>
                  </a>
                  <a
                    href="https://support.google.com/calendar/answer/41207?hl=en"
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-400 hover:text-gray-300 hover:underline flex items-center gap-1.5 text-[10px]"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span>Export events from your Google Calendar (Google Help)</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'apple' && (
            <div className="space-y-4">
              <p className="text-gray-400 text-[11px]">
                To sync your Apple iCloud calendar with Ambiently:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-white">Open Calendar on Mac or iCloud.com</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Open the Calendar app on your Mac or visit <strong>iCloud.com/calendar</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-white">Share Calendar</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Click the <strong>broadcast/sharing icon</strong> next to the calendar in the sidebar.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-white">Copy the Link</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Check <strong>Public Calendar</strong>, click <strong>Copy Link</strong>, and paste it into Ambiently. (Webcal links starting with <code>webcal://</code> are converted automatically).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'outlook' && (
            <div className="space-y-4">
              <p className="text-gray-400 text-[11px]">
                To sync your Microsoft Outlook (Office 365 or Live/Hotmail) calendar:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-white">Open Outlook on the Web</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Sign in to <strong>outlook.live.com</strong> or <strong>outlook.office.com</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-white">Go to Shared Calendars Settings</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Click <strong>Settings ⚙</strong> (top right) → <strong>Calendar</strong> → <strong>Shared calendars</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-white">Publish Calendar & Copy ICS Link</p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      Under <strong>Publish a calendar</strong>, choose your calendar, select &quot;Can view all details&quot;, click <strong>Publish</strong>, and copy the <strong>ICS</strong> link.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-gray-800 bg-gray-950/80 flex items-center justify-between shrink-0">
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
          >
            <span>Open Google Calendar</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
