import LegalPage from '../components/LegalPage';
import { privacyTitle, privacyIntro, privacyKeyPoints, privacySections, PRIVACY_UPDATED, PRIVACY_VERSION } from './legal/privacyContent';

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title={privacyTitle}
      updated={PRIVACY_UPDATED}
      version={PRIVACY_VERSION}
      intro={privacyIntro}
      keyPoints={privacyKeyPoints}
      sections={privacySections}
      other={{ to: '/terms', label: 'Read our Terms of Service' }}
    />
  );
}
