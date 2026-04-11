import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Fantasy Platform</Text>
      <Text style={{ marginTop: 8, color: '#666' }}>Multi-sport fantasy — coming soon</Text>
    </View>
  );
}
