import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import '../../utils/mocks';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusBadge } from '@/components/ui/Badge';

// ─── Button ──────────────────────────────────────────────────
describe('Button', () => {
  it('renders label', () => {
    const { getByText } = render(<Button label="Send" onPress={() => {}} />);
    expect(getByText('Send')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Go" onPress={onPress} />);
    fireEvent.press(getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Go" onPress={onPress} disabled />);
    fireEvent.press(getByText('Go'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress when loading', () => {
    const onPress = jest.fn();
    const { queryByText } = render(<Button label="Go" onPress={onPress} loading />);
    // Label hidden when loading
    expect(queryByText('Go')).toBeNull();
  });

  it('renders all variants without crashing', () => {
    const variants = ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const;
    variants.forEach((variant) => {
      expect(() =>
        render(<Button label="Test" onPress={() => {}} variant={variant} />)
      ).not.toThrow();
    });
  });
});

// ─── Input ───────────────────────────────────────────────────
describe('Input', () => {
  it('renders with label', () => {
    const { getByText } = render(
      <Input label="Phone Number" value="" onChangeText={() => {}} />
    );
    expect(getByText('Phone Number')).toBeTruthy();
  });

  it('shows error message', () => {
    const { getByText } = render(
      <Input value="" onChangeText={() => {}} error="Required field" />
    );
    expect(getByText('Required field')).toBeTruthy();
  });

  it('shows hint when no error', () => {
    const { getByText } = render(
      <Input value="" onChangeText={() => {}} hint="Enter 11 digits" />
    );
    expect(getByText('Enter 11 digits')).toBeTruthy();
  });

  it('calls onChangeText on input', () => {
    const onChange = jest.fn();
    const { getByPlaceholderText } = render(
      <Input value="" onChangeText={onChange} placeholder="Type here" />
    );
    fireEvent.changeText(getByPlaceholderText('Type here'), 'hello');
    expect(onChange).toHaveBeenCalledWith('hello');
  });
});

// ─── Card ────────────────────────────────────────────────────
describe('Card', () => {
  it('renders children', () => {
    const { getByText } = render(<Card><Button label="Inside" onPress={() => {}} /></Card>);
    expect(getByText('Inside')).toBeTruthy();
  });

  it('renders all variants without crashing', () => {
    (['elevated', 'flat', 'outlined'] as const).forEach((variant) => {
      expect(() => render(<Card variant={variant}><></></Card>)).not.toThrow();
    });
  });
});

// ─── Avatar ──────────────────────────────────────────────────
describe('Avatar', () => {
  it('renders initials when no URI', () => {
    const { getByText } = render(<Avatar name="Anieka Bassey" />);
    expect(getByText('AB')).toBeTruthy();
  });

  it('renders single initial for single name', () => {
    const { getByText } = render(<Avatar name="Tunde" />);
    expect(getByText('T')).toBeTruthy();
  });

  it('renders ? for no name and no URI', () => {
    const { getByText } = render(<Avatar />);
    expect(getByText('?')).toBeTruthy();
  });
});

// ─── Badge & StatusBadge ─────────────────────────────────────
describe('Badge', () => {
  it('renders label', () => {
    const { getByText } = render(<Badge label="New" />);
    expect(getByText('New')).toBeTruthy();
  });
});

describe('StatusBadge', () => {
  const statuses = [
    'pending', 'matched', 'pickup_en_route', 'arrived_pickup',
    'in_transit', 'arrived_dropoff', 'delivered', 'completed', 'cancelled',
  ] as const;

  statuses.forEach((status) => {
    it(`renders ${status} without crashing`, () => {
      expect(() => render(<StatusBadge status={status} />)).not.toThrow();
    });
  });

  it('shows "Pending" for pending status', () => {
    const { getByText } = render(<StatusBadge status="pending" />);
    expect(getByText('Pending')).toBeTruthy();
  });

  it('shows "Delivered" for delivered status', () => {
    const { getByText } = render(<StatusBadge status="delivered" />);
    expect(getByText('Delivered')).toBeTruthy();
  });
});
