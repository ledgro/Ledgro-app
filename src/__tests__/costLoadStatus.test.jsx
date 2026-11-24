import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const getDocs = vi.fn();
vi.mock('firebase/firestore', () => ({ collection: vi.fn(() => 'c'), getDocs: (...a) => getDocs(...a) }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ shopId: 's1' }) }));

import CostLoadStatus from '../components/CostLoadStatus';
import { useCostStore } from '../store/costStore';
import { loadCosts } from '../hooks/useCostsLoader';

beforeEach(() => { getDocs.mockReset(); useCostStore.getState().reset(); });

describe('cost load status', () => {
  it('says loading while pending', () => {
    render(<CostLoadStatus />);
    expect(screen.getByText('Loading costs...')).toBeTruthy();
  });
  it('shows a retry on failure and recovers', async () => {
    getDocs.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadCosts('s1');
    render(<CostLoadStatus />);
    const btn = screen.getByRole('button', { name: /Couldn't load costs/ });
    getDocs.mockResolvedValueOnce({ docs: [{ id: 'p1', data: () => ({ costPrice: 500, source: 'X' }) }] });
    fireEvent.click(btn);
    await vi.waitFor(() => expect(useCostStore.getState().loaded).toBe(true));
    expect(useCostStore.getState().costs.p1.costPrice).toBe(500);
    expect(useCostStore.getState().error).toBe(false);
  });
  it('renders nothing once loaded', () => {
    useCostStore.getState().setAll('s1', {});
    const { container } = render(<CostLoadStatus />);
    expect(container.textContent).toBe('');
  });
});
