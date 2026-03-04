import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 100,
    backgroundColor: '#f8f8f8',
  },
  profileTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginTop: 10,
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
  },
  email: {
    color: '#888',
    marginBottom: 20,
  },
  editButton: {
    backgroundColor: '#FFA500',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginBottom: 30,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  section: {
    width: '90%',
    marginBottom: 20,
  },
  item: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: '#FF4500',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginTop: 10,
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default styles;
