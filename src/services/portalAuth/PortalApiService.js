import { callPortalApi } from '../../lib/portalOtpClient';
import { askBeneficiaryAssistant } from '../beneficiaryAssistant/BeneficiaryAssistantService';

class BasePortalApiService {
  constructor(portal) {
    this.portal = portal;
  }

  async getPortalOverview(session) {
    const response = await callPortalApi('overview', { portal: this.portal, session });
    return response.overview;
  }

  async logout(session) {
    await callPortalApi('logout', { portal: this.portal, session });
    return true;
  }

  async requestSensitiveOtp(session, action = 'sensitive_action') {
    return callPortalApi('request-sensitive', { portal: this.portal, session, portalAction: action });
  }

  async verifySensitiveOtp({ session, code, challengeId, action = 'sensitive_action' } = {}) {
    const response = await callPortalApi('verify-sensitive', {
      portal: this.portal,
      session,
      code,
      challengeId,
      portalAction: action
    });
    return response.verified === true;
  }

  async requestProfileUpdate(session, changes = {}, meta = {}) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'request-profile-update',
      payload: { changes, notes: meta.notes }
    });
    return response.result;
  }
}

export class BeneficiaryPortalApiService extends BasePortalApiService {
  constructor() {
    super('beneficiary');
  }

  async requestAccessOtp(credentials = {}) {
    return callPortalApi('request-access', { portal: this.portal, credentials });
  }

  async verifyAccessOtp({ accessIdentifier, pin, otpCode, challengeId } = {}) {
    const response = await callPortalApi('verify-access', {
      portal: this.portal,
      credentials: { accessIdentifier, pin },
      code: otpCode,
      challengeId
    });
    return { session: response.session, auth: response.auth };
  }

  async requestOtp(session, action = 'sensitive_action') {
    return this.requestSensitiveOtp(session, action);
  }

  async verifyOtp(args = {}) {
    return this.verifySensitiveOtp(args);
  }

  async createRequest(session, payload = {}) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'create-request',
      payload
    });
    return response.result;
  }

  async askAssistant(session, payload = {}) {
    return askBeneficiaryAssistant(session, payload);
  }

  async markNoticeRead(session, noticeId) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'mark-notice-read',
      payload: { noticeId }
    });
    return response.result;
  }

  async confirmDeliveryAttendance(session, payload = {}) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'confirm-delivery-attendance',
      payload
    });
    return response.result;
  }

  async createCommunityPost(session, payload = {}) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'create-community-post',
      payload
    });
    return response.result;
  }

  async registerCommunityInterest(session, postId, payload = {}) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'register-community-interest',
      payload: { ...payload, postId }
    });
    return response.result;
  }

  async withdrawCommunityPost(session, postId) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'withdraw-community-post',
      payload: { postId }
    });
    return response.result;
  }

  async changePin(session, payload = {}) {
    console.info('[beneficiary-access] PortalApiService changePin payload', {
      keys: Object.keys(payload || {}),
      hasCurrentPin: Boolean(payload?.currentPin),
      hasNewPin: Boolean(payload?.newPin),
      hasConfirmPin: Boolean(payload?.confirmPin),
      currentPinType: typeof payload?.currentPin,
      newPinType: typeof payload?.newPin,
      confirmPinType: typeof payload?.confirmPin,
      newPinLength: String(payload?.newPin || '').length,
      confirmMatches: String(payload?.newPin || '') === String(payload?.confirmPin || '')
    });
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'change-pin',
      payload
    });
    return response.result;
  }
}

export class CollaboratorPortalApiService extends BasePortalApiService {
  constructor() {
    super('collaborator');
  }

  async requestAccessOtp(email) {
    return callPortalApi('request-access', { portal: this.portal, credentials: { email } });
  }

  async verifyAccessOtp({ email, code, challengeId } = {}) {
    const response = await callPortalApi('verify-access', {
      portal: this.portal,
      credentials: { email },
      code,
      challengeId
    });
    return { session: response.session, auth: response.auth };
  }

  async createDonationRequest(session, payload = {}) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'create-donation-request',
      payload
    });
    return response.result;
  }

  async joinCampaign(session, campaignId) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'join-campaign',
      payload: { campaignId }
    });
    return response.result;
  }

  async proposeResource(session, payload = {}) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'propose-resource',
      payload
    });
    return response.result;
  }
}

export class DonorPortalApiService extends BasePortalApiService {
  constructor() {
    super('donor');
  }

  async requestAccessOtp(email) {
    return callPortalApi('request-access', { portal: this.portal, credentials: { email } });
  }

  async verifyAccessOtp({ email, code, challengeId } = {}) {
    const response = await callPortalApi('verify-access', {
      portal: this.portal,
      credentials: { email },
      code,
      challengeId
    });
    return { session: response.session, auth: response.auth };
  }

  async createDonationIntent(session, payload = {}) {
    const response = await callPortalApi('portal-action', {
      portal: this.portal,
      session,
      portalAction: 'create-donation-intent',
      payload
    });
    return response.result;
  }
}

export function createPortalApiActions() {
  return {
    beneficiarioPortal: new BeneficiaryPortalApiService(),
    colaboradorPortal: new CollaboratorPortalApiService(),
    donantePortal: new DonorPortalApiService()
  };
}
