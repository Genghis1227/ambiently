import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Users,
  Smartphone,
  ShieldCheck,
  Sparkles,
  Cloud,
  Mail,
  ArrowRight,
  RefreshCw,
  KeyRound,
  Trash2,
  UserPlus,
  Lock,
} from 'lucide-react';
import {
  getHouseholdMembers,
  addHouseholdMember,
  removeHouseholdMember,
  getMyInvitations,
  acceptInvitation,
  leaveBoard,
  type BoardInvitation,
  type HouseholdMember,
  getCurrentUser,
  sendMagicLink,
  verifyOtpCode,
  pushToCloud,
} from '../../services/supabase';
import { useDashboardStore } from '../../store/dashboardStore';

interface ShareBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareBoardModal: React.FC<ShareBoardModalProps> = ({ isOpen, onClose }) => {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invitations, setInvitations] = useState<BoardInvitation[]>([]);
  const [invitationError, setInvitationError] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberStatus, setMemberStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const loadHouseholdData = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    setUserEmail(user?.email || null);
    if (user) {
      const [list, invites] = await Promise.all([getHouseholdMembers(), getMyInvitations()]);
      setMembers(list);
      setInvitations(invites);
    } else {
      setMembers([]);
      setInvitations([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      setMemberStatus(null);
      loadHouseholdData();
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
      await loadHouseholdData();
    } else {
      setAuthMessage(res.error || 'Invalid or expired code. Please try again.');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;
    setIsAddingMember(true);
    setMemberStatus(null);
    const res = await addHouseholdMember(newMemberEmail.trim(), 'editor');
    setIsAddingMember(false);
    if (res.success && res.member) {
      setMembers((prev) => [...prev, res.member!]);
      setNewMemberEmail('');
      setMemberStatus({
        type: 'success',
        text: `Invited ${res.member.email}. They can sign in with that email, open this screen, and accept to join this board.`,
      });
    } else {
      setMemberStatus({
        type: 'error',
        text: res.error || 'Could not add household member.',
      });
    }
  };

  const handleRemoveMember = async (id: string, email: string) => {
    const ok = await removeHouseholdMember(id);
    if (ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      setMemberStatus({
        type: 'success',
        text: `Removed ${email} from household access.`,
      });
    }
  };

  // After a switch this device holds only the other board, so its unsent changes go to the current
  // board first
  const sendPendingChanges = async () => {
    const { settings, tabs, widgets, notes } = useDashboardStore.getState();
    await pushToCloud(settings, tabs, widgets, notes).catch(() => {});
  };

  // Reload after either change so the whole app moves to the right board
  const handleAcceptInvitation = async (id: string) => {
    setInvitationError('');
    await sendPendingChanges();
    if (await acceptInvitation(id)) {
      window.location.reload();
    } else {
      setInvitationError('Could not accept this invitation. Please try again.');
    }
  };

  const handleLeaveBoard = async (invitation: BoardInvitation) => {
    setInvitationError('');
    if (invitation.accepted_at) await sendPendingChanges();
    if (!(await leaveBoard(invitation.id))) {
      setInvitationError('Could not update this invitation. Please try again.');
    } else if (invitation.accepted_at) {
      window.location.reload();
    } else {
      setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Verified Mobile & Household Access</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col space-y-4">
          {!userEmail && !loading ? (
            /* STATE 1: User is NOT signed in */
            <div className="w-full space-y-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/40 via-purple-950/20 to-gray-900 border border-blue-500/30">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Zero-Trust Cloud Sync</h3>
                    <p className="text-[11px] text-gray-400">
                      Protected by verified email authentication — no public links or open join codes.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 pt-2 text-xs text-gray-300">
                  <div className="flex items-start gap-2">
                    <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>100% Private by Default:</strong> Unauthenticated visitors can never view your calendar, photos, or notes.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Verified Mobile Remote:</strong> Sign in with your email on your phone to manage sticky notes and checklists.
                    </span>
                  </div>
                </div>
              </div>

              {/* Inline Sign In Form */}
              <div className="p-4 rounded-xl bg-gray-950/80 border border-gray-800 space-y-3">
                <div className="text-xs font-semibold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-cyan-400" />
                  <span>Sign In with Email Verification Code</span>
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
                        <span>
                          Code sent to <strong className="text-white font-mono">{emailInput}</strong>
                        </span>
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
            /* STATE 2: User IS signed in - Verified Household Email Accesslist */
            <div className="w-full space-y-4">
              {/* Signed-In Owner Banner */}
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-gray-200 space-y-1">
                  <div className="font-bold text-white">
                    Zero-Trust Protection Active ({userEmail})
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    Public join codes and token links are disabled. Only you and the verified household email addresses listed below can access this board after signing in with an email verification code.
                  </p>
                </div>
              </div>

              {/* How to Connect Your Own Phone */}
              <div className="p-3.5 rounded-xl bg-gray-950/70 border border-gray-800 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  <span>Connecting Your Own Phone</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Open <strong className="text-gray-200 font-mono">{window.location.origin}</strong> on your phone and sign in with <strong className="text-cyan-300 font-mono">{userEmail}</strong>.
                </p>
              </div>

              {/* Invitations From Other Boards */}
              {invitations.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Board Invitations</span>
                  </div>
                  <p className="text-[11px] text-amber-100/80 leading-relaxed">
                    Only accept an invitation from someone you know. Once you accept, this device syncs with their board and they can see your notes and widgets.
                  </p>
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="text-gray-200 truncate">{invitation.board_title}</div>
                        <div className="font-mono text-[11px] text-gray-400 truncate">{invitation.owner_email}</div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {!invitation.accepted_at && (
                          <button
                            type="button"
                            onClick={() => handleAcceptInvitation(invitation.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white rounded-lg transition-all cursor-pointer"
                          >
                            Accept
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleLeaveBoard(invitation)}
                          className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-[11px] font-bold text-gray-200 rounded-lg transition-all cursor-pointer"
                        >
                          {invitation.accepted_at ? 'Leave' : 'Decline'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {invitationError && <p className="text-[11px] text-red-300">{invitationError}</p>}
                </div>
              )}

              {/* Authorize Spouse / Household Member by Email */}
              <div className="p-4 rounded-xl bg-gray-950/90 border border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>Authorized Household Emails ({members.length})</span>
                  </div>
                </div>

                <form onSubmit={handleAddMember} className="flex gap-2">
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="Spouse or family email (e.g. partner@gmail.com)"
                    className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isAddingMember}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isAddingMember ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Authorize</span>
                      </>
                    )}
                  </button>
                </form>

                {memberStatus && (
                  <p
                    className={`text-[11px] p-2 rounded-lg border ${
                      memberStatus.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                        : 'bg-red-950/40 border-red-800/50 text-red-300'
                    }`}
                  >
                    {memberStatus.text}
                  </p>
                )}

                {loading ? (
                  <div className="py-4 flex items-center justify-center text-xs text-gray-500 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Loading authorized emails...</span>
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-[11px] text-gray-500 py-2 text-center">
                    No additional household emails authorized. Only <strong className="text-gray-400">{userEmail}</strong> can access this board.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="font-mono text-gray-200 truncate">{m.email}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase">
                            {m.accepted_at ? m.role : 'invited'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id, m.email)}
                          title="Revoke access"
                          className="p-1 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
