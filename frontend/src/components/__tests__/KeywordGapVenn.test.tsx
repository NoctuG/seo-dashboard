import { render, screen } from '@testing-library/react';
import KeywordGapVenn from '../KeywordGapVenn';

describe('KeywordGapVenn', () => {
  it('renders totals and intersection from stats', () => {
    render(
      <KeywordGapVenn
        stats={{ common: 20, gap: 35, unique: 15 }}
        myDomainLabel="我方"
        competitorLabel="competitor.com"
      />,
    );

    // 左圈总量 = common + unique
    expect(screen.queryByText('35')).not.toBeNull();
    // 右圈总量 = common + gap
    expect(screen.queryByText('55')).not.toBeNull();
    // 交集 = common
    expect(screen.queryByText('20')).not.toBeNull();

    expect(screen.queryByText(/Common（交集）: 20/)).not.toBeNull();
    expect(screen.queryByText(/Gap（差距）: 35/)).not.toBeNull();
    expect(screen.queryByText(/Unique（我方独有）: 15/)).not.toBeNull();
  });
});
