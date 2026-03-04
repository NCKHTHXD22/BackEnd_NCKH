import { StyleSheet, Dimensions } from "react-native";
const { width } = Dimensions.get("window");

export default StyleSheet.create({
  infoBox: {
    position: "absolute",
    bottom: 20,
    left: 10,
    right: 10,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 4,
  },
  content: {
    fontSize: 14,
    marginBottom: 4,
  },
  subtext: {
    fontSize: 12,
    color: "#555",
    marginTop: 4,
  },

  levelText: {
    fontWeight: "bold",
    fontSize: 18,
    color: "#d32f2f",
    marginBottom: 6,
  },

  statusText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#1976d2",
  },

  detailText: {
    fontSize: 15,
    color: "#1e293b", // xanh đen
    marginVertical: 3,
  },

  dayTabs: {
    marginTop: 12,
    paddingVertical: 4,
  },

  dayTab: {
  width: width / 5.5,
  alignItems: "center",
  paddingVertical: 10,
  borderRadius: 12,
  marginHorizontal: 6,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 3,
  elevation: 5,
},
dayTabActive: {
  borderColor: "#ffffff",
  borderWidth: 1.5,
},

  dayText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },

  minMaxText: {
    fontSize: 12,
    color: "#fff",
  },

  hourTabs: {
    marginTop: 12,
    paddingVertical: 4,
  },

  hourItem: {
    alignItems: "center",
    width: width / 6,
    paddingVertical: 6,
    backgroundColor: "#e3f2fd",
    borderRadius: 10,
    marginHorizontal: 5,
  },

  hourText: {
    fontSize: 12,
    color: "#0d47a1",
  },

  hourTemp: {
    fontSize: 14,
    marginTop: 4,
    color: "#d84315",
    fontWeight: "bold",
  },
  thumbnailImage: {
  width: 120,
  height: 100,
  borderRadius: 10,
  marginTop: 5,
},

modalContainer: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.8)",
  justifyContent: "center",
  alignItems: "center",
},

fullImage: {
  width: "90%",
  height: "70%",
  borderRadius: 10,
},
 menuContainer: {
    position: "absolute",
    top: 50,
    left: 10,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 6,
    zIndex: 999,
    flexDirection: "column",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 8,
  },
  menuButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  menuButtonActive: {
    backgroundColor: "#bbdefb",
    borderRadius: 8,
  },
  menuText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0d47a1",
  },
  zoomlocation: {
    backgroundColor: "#fff",
      borderRadius: 50,
      padding: 10,
      elevation: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
  },
  zoomMap:{
    position: "absolute", bottom: 30, right: 20, zIndex: 999,
  },
  zoomIcon:{
    width: 24, height: 24, tintColor: "#1976d2",
  },
});
