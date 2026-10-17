import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchSheet from '../components/SearchSheet';
import { useCatalogStore } from '../store/catalogStore';

const slide = (id, size, stock) => ({
  id, groupId: 'g1', baseName: 'Nike Slides', options: { Size: size },
  name: `Nike Slides - ${size}`, lastUsedPrice: 50000, stockCount: stock, isActive: true, category: 'Slides',
});

describe('SearchSheet size buttons', () => {
  test('sizes of one product show as one row with a button per size', () => {
    useCatalogStore.setState({ items: [slide('a', '6', 4), slide('b', '7', 0), slide('c', '8', 2), { id: 'x', name: 'Socks', lastUsedPrice: 9900, isActive: true }] });
    const onAdd = vi.fn();
    render(<SearchSheet onAddItem={onAdd} onRemoveOne={() => {}} cartQty={new Map()} itemCount={0} />);
    fireEvent.click(screen.getByText('Search items'));
    fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'nike' } });
    expect(screen.getAllByText('Nike Slides')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Add Nike Slides - 8'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nike Slides - 8', catalogId: 'c' }));
    expect(screen.getByText('Out')).toBeTruthy();
  });
});
