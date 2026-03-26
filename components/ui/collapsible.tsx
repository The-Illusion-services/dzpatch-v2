import { PropsWithChildren, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View>
      <TouchableOpacity
        style={styles.heading}
        onPress={() => setIsOpen((value) => !value)}
        activeOpacity={0.8}>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color="#44474e"
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />
        <Text style={styles.title}>{title}</Text>
      </TouchableOpacity>
      {isOpen && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '600', color: '#000D22' },
  content: { marginTop: 6, marginLeft: 24 },
});
