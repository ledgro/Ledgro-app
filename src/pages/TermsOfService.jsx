import LegalPage from '../components/LegalPage';
import { termsTitle, termsIntro, termsKeyPoints, termsSections, TERMS_UPDATED, TERMS_VERSION } from './legal/termsContent';

export default function TermsOfService() {
  return (
    <LegalPage
      title={termsTitle}
      updated={TERMS_UPDATED}
      version={TERMS_VERSION}
      intro={termsIntro}
      keyPoints={termsKeyPoints}
      sections={termsSections}
      other={{ to: '/privacy', label: 'Read our Privacy Policy' }}
    />
  );
}
