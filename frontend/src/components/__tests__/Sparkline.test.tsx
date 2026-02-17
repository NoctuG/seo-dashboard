import { render, screen } from '@testing-library/react';
import Sparkline, { EMPTY_PLACEHOLDER, getTrendDirection } from '../Sparkline';

describe('Sparkline', () => {
  it('shows placeholder for minimal points', () => {
    render(<Sparkline data={[{ value: 5 }]} />);
    expect(screen.getByText(EMPTY_PLACEHOLDER)).not.toBeNull();
  });

  it('shows placeholder for empty array', () => {
    render(<Sparkline data={[]} />);
    expect(screen.getByText(EMPTY_PLACEHOLDER)).not.toBeNull();
  });

  it('renders down trend style for negative trend when lower is not better', () => {
    render(<Sparkline data={[{ value: 10 }, { value: 7 }]} />);
    const polyline = screen.getByTestId('sparkline-polyline');
    expect(polyline.getAttribute('class')).toContain('text-rose-600');
    expect(getTrendDirection(10, 7, false)).toBe('down');
  });
});
