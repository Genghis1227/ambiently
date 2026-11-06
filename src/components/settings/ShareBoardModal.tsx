import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  X,
  Users,
  Copy,
  Check,
  Smartphone,
  ShieldCheck,
  Sparkles,
  Cloud,
  Mail,
  ArrowRight,
  RefreshCw,
  KeyRound,
  HeartHandshake,
} from 'lucide-react';
import {
  getOrCreateInviteCode,
  rotateInviteCode,
  type InviteData,
  getCurrentUser,
  sendMagicLink,
  verifyOtpCode,
} from '../../services/supabase';

interface ShareBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareBoardModal: React.FC<ShareBoardModalProps> = ({ isOpen, onClose }) => {
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [activeTab, setActiveTab] = useState<'admin' | 'family'>('family');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rotatingCode, setRotatingCode] = useState(false);

  // Authentication State for unauthenticated users
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<'email' | 'otp'>('email');
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadInviteData = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    setUserEmail(user?.email || null);
    if (user) {
      const data = await getOrCreateInviteCode();
      setInviteData(data);
    } else {
      setInviteData(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadInviteData();
    }
  }, [isOpen]);

  const handleSendMagicLink = async () => {
    if (!emailInput.trim()) return;
    setIsSendingCode(true);
    setAuthMessage('Sending login code to your email...');
    const res = await sendMagicLink(emailInput.trim());
    setIsSendingCode(false);
    if (res.success) {
      setAuthStep('otp');
      setOtpInput('');
      setAuthMessage('Check your email! Enter the 6-digit code below to connect.');
    } else {
      setAuthMessage(res.error || 'Failed to send login code.');
    }
  };

  const handleVerifyOtp = async () => {
    const cleanToken = otpInput.replace(/\D/g, '').trim();
    if (!cleanToken || cleanToken.length < 6) {
      setAuthMessage('Please enter the 6-digit verification code.');
      return;
    }
    setIsVerifyingOtp(true);
    setAuthMessage('Verifying code...');
    const res = await verifyOtpCode(emailInput.trim(), cleanToken);
    setIsVerifyingOtp(false);
    if (res.success) {
      setAuthMessage('');
      await loadInviteData();
    } else {
      setAuthMessage(res.error || 'Invalid or expired code. Please try again.');
    }
  };

  const handleRotateCode = async () => {
    setRotatingCode(true);
    const updated = await rotateInviteCode();
    if (updated) {
      setInviteData(updated);
    }
    setRotatingCode(false);
  };

  if (!isOpen) return null;

  const currentQrUrl =
    activeTab === 'admin'
      ? inviteData?.adminPairUrl || inviteData?.url || ''
      : inviteData?.url || '';

  const handleCopyLink = () => {
    // Security: Never copy raw session tokens (adminPairUrl) to clipboard.
    const safeCopyUrl = inviteData?.url || '';
    if (!safeCopyUrl) return;
    navigator.clipboard.writeText(safeCopyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col overflow-hidden text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">Connect Mobile Companion</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col items-center">
          {/* STATE 1: User is NOT signed in - Explain Benefits of Cloud Sync + Inline Sign-in */}
          {!userEmail && !loading ? (
            <div className="w-full space-y-4 text-left">
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/40 via-purple-950/20 to-gray-900 border border-blue-500/30">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Unlock Mobile Remote with Cloud Sync</h3>
                    <p className="text-[11px] text-gray-400">Live two-way phone sync requires a free cloud connection.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 pt-2 text-xs text-gray-300">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span><strong>Pocket Remote Control:</strong> Add sticky notes, check off grocery items, and manage boards from your phone.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Instant Live Updates:</strong> Real-time WebSockets sync phone edits to this wall display live.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <HeartHandshake className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span><strong>Frictionless Household Access:</strong> Pair your own phone with 1 tap, while kids check off chores with zero account required.</span>
                  </div>
                </div>
              </div>

              {/* Inline Sign In Form */}
              <div className="p-4 rounded-xl bg-gray-950/80 border border-gray-800 space-y-3">
                <div className="text-xs font-semibold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                  <span>Connect in 10 Seconds (Free, No Password)</span>
                </div>

                {authStep === 'email' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMagicLink();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="Enter your email (e.g. you@example.com)"
                      className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                      required
                    />
                    <button
                      type="submit"
                      disabled={isSendingCode}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-xs font-bold text-white rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSendingCode ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>Send Code</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-gray-300">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Code sent to <strong className="text-white font-mono">{emailInput}</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthStep('email');
                          setAuthMessage('');
                        }}
                        className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer"
                      >
                        Change
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value)}
                        placeholder="Enter 6-digit code"
                        className="flex-1 px-3 py-2 bg-gray-900 border border-cyan-500/50 rounded-xl text-center text-sm font-mono tracking-widest text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={isVerifyingOtp}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs font-bold text-white rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isVerifyingOtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Verify & Connect</span>}
                      </button>
                    </div>
                  </div>
                )}

                {authMessage && (
                  <p className="text-[11px] text-cyan-300/90 leading-relaxed bg-cyan-950/40 p-2 rounded-lg border border-cyan-800/40">
                    {authMessage}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* STATE 2: User IS signed in - Multi-Tier Pairing */
            <div className="w-full flex flex-col items-center space-y-4">
              {/* Role Switcher Tabs */}
              <div className="w-full grid grid-cols-2 gap-1.5 bg-gray-950 p-1 rounded-xl border border-gray-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'admin'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Pair My Phone / Spouse</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('family')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'family'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Kids & Family (No Account)</span>
                </button>
              </div>

              {/* Tab Description & Badge */}
              <div className="text-center space-y-1">
                {activeTab === 'admin' ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>One-Tap Login as <strong className="font-mono">{userEmail}</strong></span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed max-w-sm pt-1">
                      Scan with your phone camera to <strong>automatically sign in</strong> on mobile. No passwords, emails, or codes to type on your phone!
                    </p>
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-medium">
                      <HeartHandshake className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Household Member Mode (Zero Account Needed)</span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed max-w-sm pt-1">
                      Kids and household guests can check off chores and add notes to this board <strong>without needing an email or account</strong>.
                    </p>
                  </>
                )}
              </div>

              {/* QR Code Container */}
              <div className="p-4 bg-white rounded-2xl shadow-2xl border-2 border-gray-200">
                {loading ? (
                  <div className="w-44 h-44 flex items-center justify-center text-xs text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : currentQrUrl ? (
                  <QRCodeSVG
                    value={currentQrUrl}
                    size={180}
                    level="M"
                    includeMargin={false}
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-xs text-gray-500">
                    Generating Code...
                  </div>
                )}
              </div>

              {inviteData && (
                <div className="w-full space-y-3">
                  {/* Prominent 6-Digit Code for Kids Mode + Rotate Button */}
                  <div className="flex items-center justify-between bg-gray-950/70 px-3.5 py-2.5 rounded-xl border border-gray-800">
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">
                        Household Join Code:
                      </span>
                      <span className="text-xl font-mono font-extrabold text-cyan-400 tracking-widest mt-0.5">
                        {inviteData.code}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRotateCode}
                      disabled={rotatingCode}
                      title="Generate a new invite code and revoke the old one"
                      className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] font-medium text-gray-300 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${rotatingCode ? 'animate-spin text-cyan-400' : 'text-gray-400'}`} />
                      <span>Reset Code</span>
                    </button>
                  </div>

                  {/* Direct Copy Link Button (Strictly copies guest join URL without session tokens) */}
                  <button
                    onClick={handleCopyLink}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-750 border border-gray-700 text-xs font-semibold text-gray-200 transition-all active:scale-98 shadow-sm cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">
                          Household Join Link Copied! (Private calendars excluded)
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-gray-400" />
                        <span>Copy Household Join Link (?join={inviteData.code})</span>
                      </>
                    )}
                  </button>

                  <div className="text-[11px] text-gray-500 flex items-center justify-center gap-1.5 pt-1">
                    <Smartphone className="w-3.5 h-3.5 text-cyan-400/80" />
                    <span>Private calendars stay owner-only • Guests only see shared board items</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
