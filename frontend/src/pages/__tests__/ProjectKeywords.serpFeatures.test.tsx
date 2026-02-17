import { render, screen } from '@testing-library/react';
import {
    filterKeywordsBySerpFeature,
    getSerpFeatureDisplay,
    parseSerpFeaturesJson,
} from '../ProjectKeywords';

describe('ProjectKeywords SERP features', () => {
    it('renders icons and fallback badge from mixed serp_features_json, and filter result stays consistent', () => {
        const serpFeaturesJson = JSON.stringify(['video', 'shopping', 'unknown_feature']);
        const parsedFeatures = parseSerpFeaturesJson(serpFeaturesJson);

        const keywords = [
            { id: 1, market: 'us', serp_features_json: serpFeaturesJson },
            { id: 2, market: 'us', serp_features_json: JSON.stringify(['image_pack']) },
        ];

        const filteredByVideo = filterKeywordsBySerpFeature(keywords, 'all', 'video');
        const filteredByShopping = filterKeywordsBySerpFeature(keywords, 'all', 'shopping');

        render(
            <div>
                {parsedFeatures.map((feature) => {
                    const display = getSerpFeatureDisplay(feature);
                    if (display.kind === 'known') {
                        const Icon = display.config.icon;
                        return <Icon key={feature} aria-label={display.config.label} />;
                    }
                    return <span key={feature}>{display.feature}</span>;
                })}
            </div>,
        );

        expect(screen.queryByLabelText('Video')).not.toBeNull();
        expect(screen.queryByLabelText('Shopping')).not.toBeNull();
        expect(screen.queryByText('unknown_feature')).not.toBeNull();

        expect(filteredByVideo.map((item) => item.id)).toEqual([1]);
        expect(filteredByShopping.map((item) => item.id)).toEqual([1]);
    });
});
