import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 50,
    paddingHorizontal: 10,
  },
  header: {
    fontSize: 30,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#e60000",
  },
  item: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: "center",
  },
  unread: {
    backgroundColor: "#e6f0ff",
  },
  read: {
    backgroundColor: "#f9f9f9",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#d0e4ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  sender: {
    fontWeight: "600",
    marginBottom: 2,
    color: "#333",
  },
  message: {
    color: "#333",
  },
  time: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },
  empty: {
    textAlign: "center",
    color: "#666",
    marginTop: 20,
    fontSize: 16,
  },
});
