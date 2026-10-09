import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Text } from './Text';

type Block = { kind: 'h1' | 'h2' | 'p' | 'li'; text: string };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ kind: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ kind: 'h2', text: line.slice(3) }); }
    else if (line.startsWith('# ')) { flush(); blocks.push({ kind: 'h1', text: line.slice(2) }); }
    else if (/^[-*] /.test(line)) { flush(); blocks.push({ kind: 'li', text: line.slice(2) }); }
    else para.push(line);
  }
  flush();
  return blocks;
}

/** Minimal, dependency-free renderer for admin-authored policy text: headings, paragraphs and bullet lists. */
export function Markdown({ source }: { source: string }) {
  return (
    <View style={styles.wrap}>
      {parse(source).map((b, i) =>
        b.kind === 'h1' ? <Text key={i} variant="h2" accessibilityRole="header">{b.text}</Text>
        : b.kind === 'h2' ? <Text key={i} variant="h3" accessibilityRole="header">{b.text}</Text>
        : b.kind === 'li' ? (
          <View key={i} style={styles.li}><Text variant="body" color={colors.goldText}>•</Text><Text variant="body" style={styles.liText}>{b.text}</Text></View>
        ) : <Text key={i} variant="body">{b.text}</Text>,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  li: { flexDirection: 'row', gap: 10, paddingLeft: 4 },
  liText: { flex: 1 },
});
