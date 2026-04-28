import { StyleSheet, Dimensions } from "react-native";

export default StyleSheet.create({
     container: { padding: 16, flex: 1 },
  title: { fontWeight: "bold", color: "#e60000", fontSize: 16, textAlign: "center", marginBottom: 12 },
  row: { flexDirection: "row", marginBottom: 10 },
  input: {
    borderWidth: 1, borderColor: "#ccc",
    padding: 10, borderRadius: 6, marginBottom: 10,
    backgroundColor: "#fff",
  },
  label: { marginVertical: 6, fontWeight: "500" },
  map: { height: 200, borderRadius: 10, marginBottom: 10 },
  segment: { flexDirection: "row", justifyContent: "space-around", marginBottom: 10 },
  segmentBtn: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 20, backgroundColor: "#eee",
  },
  segmentSelected: { backgroundColor: "#ccc" },
  imagePicker: {
    alignItems: "center",
    borderWidth: 1, borderColor: "#bbb",
    padding: 20, borderRadius: 10,
    marginBottom: 10,
  },
  image: { width: 120, height: 120, borderRadius: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  switchLabel: { marginLeft: 10, flex: 1 },
  submitBtn: {
    backgroundColor: "#444", padding: 14, borderRadius: 8,
    alignItems: "center", marginTop: 10,
  },
  submitText: { color: "white", fontWeight: "bold" },
  suggestionsList: {
    position: "absolute", top: "100%", marginTop: 2, backgroundColor: "#fff",
    borderColor: "#ccc", borderWidth: 1,
    zIndex: 10, elevation: 10, width: "100%", maxHeight: 160,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  imagePicker: {
  alignItems: "center",
  borderWidth: 1,
  borderColor: "#bbb",
  padding: 10,
  borderRadius: 10,
  marginBottom: 10,
  minHeight: 140,
  justifyContent: "center",
  backgroundColor: "#fafafa",
},

imageGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-start",
  gap: 10,
},

imageWrapper: {
  width: 80,
  height: 80,
  margin: 4,
  position: "relative",
},

image: {
  width: "100%",
  height: "100%",
  borderRadius: 8,
},

removeIcon: {
  position: "absolute",
  top: -6,
  right: -6,
  backgroundColor: "red",
  borderRadius: 12,
  padding: 4,
  zIndex: 1,
},
overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", // nền mờ
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 10,
  },
})