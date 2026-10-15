import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Pressable, RefreshControl,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { CatalogItem, checkApi, getCatalog } from "./src/api";
import { theme as t } from "./src/theme";

type Tab = "home" | "favorites" | "cart" | "account";
type Category = { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap };

const categories: Category[] = [
  { label: "Tudo", icon: "view-grid-outline" },
  { label: "Alimentação", icon: "food-apple-outline" },
  { label: "Mercado", icon: "basket-outline" },
  { label: "Eletrônicos", icon: "cellphone" },
  { label: "Casa", icon: "home-outline" },
  { label: "Pet", icon: "paw-outline" },
  { label: "Serviços", icon: "tools" },
];

const money = (value?: string | number) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Consulte";
};

function BrandMark() {
  return (
    <View style={styles.brandMark}>
      <Ionicons name="flash" size={25} color={t.purpleDeep} />
    </View>
  );
}

function ProductCard({ item, onFavorite, favorite }: {
  item: CatalogItem; onFavorite: (id: string | number) => void; favorite: boolean;
}) {
  const image = item.image_url || item.image;
  const title = item.name || item.title || "Item do SyncroWay";
  return (
    <View style={styles.productCard}>
      <View style={styles.productImage}>
        {image ? (
          <Image source={{ uri: image }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <MaterialCommunityIcons name="package-variant-closed" size={42} color="#C6BED6" />
            <Text style={styles.imagePlaceholderText}>Foto em breve</Text>
          </View>
        )}
        <Pressable accessibilityLabel={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          onPress={() => onFavorite(item.id)} style={styles.favoriteButton}>
          <Ionicons name={favorite ? "heart" : "heart-outline"} size={19} color={favorite ? "#D83D67" : t.ink} />
        </Pressable>
      </View>
      <View style={styles.productInfo}>
        <View style={styles.availableBadge}><View style={styles.availableDot} /><Text style={styles.availableText}>Disponível</Text></View>
        <Text style={styles.price}>{money(item.price)}</Text>
        <Text numberOfLines={2} style={styles.delivery}>Frete combinado com a loja</Text>
        <Text numberOfLines={2} style={styles.productName}>{title}</Text>
        <Text numberOfLines={1} style={styles.storeName}>{item.store?.name || item.store_name || "Loja parceira"}</Text>
        <Pressable style={styles.addButton} onPress={() => {}} accessibilityLabel={`Ver ${title}`}>
          <Text style={styles.addButtonText}>Ver produto</Text><Ionicons name="arrow-forward" size={16} color={t.white} />
        </Pressable>
      </View>
    </View>
  );
}

function Header({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.brandRow}>
          <BrandMark />
          <View>
            <Text style={styles.brandName}>Syncro<Text style={styles.brandNameAccent}>Way</Text></Text>
            <Text style={styles.brandTagline}>O comércio perto de você</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerIcon} accessibilityLabel="Notificações">
            <Ionicons name="notifications-outline" size={23} color={t.white} />
          </Pressable>
          <Pressable style={styles.headerIcon} accessibilityLabel="Minha conta">
            <Ionicons name="person-circle-outline" size={25} color={t.white} />
          </Pressable>
        </View>
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={22} color={t.muted} />
        <TextInput value={query} onChangeText={setQuery}
          placeholder="Buscar produtos, serviços e lojas..." placeholderTextColor="#8E879B"
          style={styles.searchInput} returnKeyType="search" accessibilityLabel="Buscar no SyncroWay" />
        {query.length > 0 && <Pressable onPress={() => setQuery("")}><Ionicons name="close-circle" size={19} color={t.muted} /></Pressable>}
      </View>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [type, setType] = useState<"product" | "service">("product");
  const [category, setCategory] = useState("Tudo");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [favorites, setFavorites] = useState<(string | number)[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    const online = await checkApi();
    setApiOnline(online);
    try {
      const result = await getCatalog(type);
      setItems(result);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Não foi possível carregar o catálogo.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter(item => {
    const name = (item.name || item.title || "").toLocaleLowerCase("pt-BR");
    const store = (item.store?.name || item.store_name || "").toLocaleLowerCase("pt-BR");
    const matchesQuery = !query.trim() || `${name} ${store} ${item.description || ""}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"));
    const matchesCategory = category === "Tudo" || category === "Serviços" || (item.category || "").toLocaleLowerCase("pt-BR").includes(category.toLocaleLowerCase("pt-BR"));
    return matchesQuery && matchesCategory;
  }), [items, query, category]);

  const toggleFavorite = (id: string | number) => setFavorites(current =>
    current.includes(id) ? current.filter(value => value !== id) : [...current, id]);

  const renderCatalog = () => {
    const displayed = tab === "favorites" ? filtered.filter(item => favorites.includes(item.id)) : filtered;
    return (
      <FlatList
        data={displayed}
        keyExtractor={item => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.catalogList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.purpleBright} />}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <View style={styles.heroPill}><Ionicons name="sparkles" size={14} color={t.lime} /><Text style={styles.heroPillText}>SEU MARKETPLACE LOCAL</Text></View>
              <Text style={styles.heroTitle}>Tudo da sua cidade,{"\n"}<Text style={styles.heroTitleAccent}>mais perto de você.</Text></Text>
              <Text style={styles.heroCopy}>Descubra produtos, encontre lojas e contrate serviços locais em um só lugar.</Text>
              <View style={styles.heroButtons}>
                <Pressable onPress={() => { setType("product"); setTab("home"); }} style={styles.heroPrimary}>
                  <Ionicons name="bag-check-outline" size={18} color={t.purpleDeep} /><Text style={styles.heroPrimaryText}>Ver produtos</Text>
                </Pressable>
                <Pressable onPress={() => { setType("service"); setTab("home"); }} style={styles.heroSecondary}>
                  <MaterialCommunityIcons name="tools" size={18} color={t.white} /><Text style={styles.heroSecondaryText}>Ver serviços</Text>
                </Pressable>
              </View>
              <View style={styles.benefits}>
                <View style={styles.benefit}><Ionicons name="storefront-outline" size={17} color={t.lime} /><Text style={styles.benefitText}>Lojas locais</Text></View>
                <View style={styles.benefit}><Ionicons name="car-outline" size={17} color={t.lime} /><Text style={styles.benefitText}>Entrega combinada</Text></View>
              </View>
              <View style={styles.heroGlow} />
            </View>
            <View style={styles.sectionHeader}>
              <View><Text style={styles.eyebrow}>EXPLORE O MARKETPLACE</Text><Text style={styles.sectionTitle}>Encontre o que você <Text style={styles.sectionTitleAccent}>precisa</Text></Text></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
              {categories.filter(c => type === "service" ? c.label === "Tudo" || c.label === "Serviços" : c.label !== "Serviços").map(c => {
                const active = category === c.label;
                return <Pressable key={c.label} onPress={() => setCategory(c.label)} style={[styles.categoryChip, active && styles.categoryChipActive]}>
                  <MaterialCommunityIcons name={c.icon} size={18} color={active ? t.white : t.ink} />
                  <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{c.label}</Text>
                </Pressable>;
              })}
            </ScrollView>
            <View style={styles.offersHeader}>
              <View><Text style={styles.eyebrow}>SELEÇÃO PARA VOCÊ</Text><Text style={styles.offersTitle}>{type === "service" ? "Serviços em destaque" : "Ofertas para você"} <Text style={styles.offersCount}>({displayed.length})</Text></Text></View>
              <View style={styles.liveBadge}><View style={[styles.liveDot, { backgroundColor: apiOnline ? t.green : "#D5A12B" }]} /><Text style={styles.liveText}>{apiOnline ? "Atualizado" : "Conectando"}</Text></View>
            </View>
            {loading && <View style={styles.stateBox}><ActivityIndicator size="large" color={t.purpleBright} /><Text style={styles.stateText}>Carregando o marketplace...</Text></View>}
            {!loading && !!error && <View style={styles.stateBox}><Ionicons name="cloud-offline-outline" size={30} color={t.muted} /><Text style={styles.stateTitle}>Não foi possível carregar</Text><Text style={styles.stateText}>{error}</Text><Pressable style={styles.retryButton} onPress={() => load()}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View>}
            {!loading && !error && displayed.length === 0 && <View style={styles.stateBox}><MaterialCommunityIcons name="shopping-outline" size={34} color={t.muted} /><Text style={styles.stateTitle}>{tab === "favorites" ? "Seus favoritos aparecem aqui" : "Nenhum item encontrado"}</Text><Text style={styles.stateText}>Tente outra busca ou categoria. As fotos poderão ser adicionadas ao catálogo depois.</Text></View>}
          </View>
        }
        renderItem={({ item }) => <View style={styles.productColumn}><ProductCard item={item} favorite={favorites.includes(item.id)} onFavorite={toggleFavorite} /></View>}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={t.purple} />
      <Header query={query} setQuery={setQuery} />
      {tab === "account" ? (
        <View style={styles.accountScreen}>
          <View style={styles.accountMark}><Ionicons name="person-outline" size={35} color={t.purpleBright} /></View>
          <Text style={styles.accountTitle}>Sua conta SyncroWay</Text>
          <Text style={styles.accountCopy}>Entre para acompanhar pedidos, salvar endereços e gerenciar seus favoritos.</Text>
          <Pressable style={styles.accountButton}><Text style={styles.accountButtonText}>Entrar ou criar conta</Text></Pressable>
          <Text style={styles.accountNote}>A autenticação será conectada ao backend na próxima etapa.</Text>
        </View>
      ) : renderCatalog()}
      <View style={styles.tabBar}>
        {([
          { key: "home", label: "Início", icon: "home-outline", active: "home" },
          { key: "favorites", label: "Favoritos", icon: "heart-outline", active: "heart" },
          { key: "cart", label: "Carrinho", icon: "cart-outline", active: "cart" },
          { key: "account", label: "Conta", icon: "person-outline", active: "person" },
        ] as const).map(item => {
          const active = tab === item.key;
          return <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}><Ionicons name={item.icon as any} size={21} color={active ? t.purpleBright : "#898296"} /></View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: t.background },
  header: { backgroundColor: t.purple, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: t.lime, alignItems: "center", justifyContent: "center" },
  brandName: { color: t.white, fontSize: 22, fontWeight: "900", letterSpacing: -0.7 },
  brandNameAccent: { color: t.lime },
  brandTagline: { color: "#D8CFF0", fontSize: 11, marginTop: -2 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,.10)", alignItems: "center", justifyContent: "center" },
  searchBar: { height: 50, borderRadius: 15, paddingHorizontal: 13, backgroundColor: t.white, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, color: t.ink, fontSize: 14, paddingVertical: 0 },
  catalogList: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 22 },
  hero: { overflow: "hidden", backgroundColor: t.purple, borderRadius: 24, padding: 20, marginBottom: 25, position: "relative" },
  heroPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 11, borderWidth: 1, borderColor: "rgba(255,255,255,.23)", backgroundColor: "rgba(255,255,255,.08)" },
  heroPillText: { color: t.white, fontSize: 9, fontWeight: "800", letterSpacing: 1.6 },
  heroTitle: { color: t.white, fontSize: 29, lineHeight: 33, fontWeight: "900", letterSpacing: -1.1, marginTop: 17 },
  heroTitleAccent: { color: t.lime },
  heroCopy: { color: "#F0EAFB", fontSize: 14, lineHeight: 21, marginTop: 13, marginBottom: 17 },
  heroButtons: { flexDirection: "row", gap: 9 },
  heroPrimary: { flex: 1, minHeight: 47, borderRadius: 99, backgroundColor: t.lime, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 8 },
  heroPrimaryText: { color: t.purpleDeep, fontSize: 12, fontWeight: "800" },
  heroSecondary: { flex: 1, minHeight: 47, borderRadius: 99, borderWidth: 1, borderColor: "rgba(255,255,255,.35)", backgroundColor: "rgba(255,255,255,.08)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 8 },
  heroSecondaryText: { color: t.white, fontSize: 12, fontWeight: "800" },
  benefits: { flexDirection: "row", flexWrap: "wrap", gap: 13, marginTop: 17 },
  benefit: { flexDirection: "row", alignItems: "center", gap: 5 },
  benefitText: { color: "#F2ECFF", fontSize: 11, fontWeight: "600" },
  heroGlow: { position: "absolute", width: 170, height: 170, borderRadius: 100, right: -90, top: -70, backgroundColor: "rgba(155,70,255,.38)" },
  sectionHeader: { marginBottom: 12 },
  eyebrow: { color: t.purpleBright, fontSize: 10, fontWeight: "900", letterSpacing: 2.1, marginBottom: 6 },
  sectionTitle: { color: t.ink, fontSize: 23, fontWeight: "900", letterSpacing: -0.7, lineHeight: 29 },
  sectionTitleAccent: { color: t.purpleBright },
  categories: { gap: 9, paddingBottom: 20, paddingRight: 12 },
  categoryChip: { minHeight: 42, paddingHorizontal: 15, borderRadius: 99, borderWidth: 1, borderColor: t.line, backgroundColor: t.white, flexDirection: "row", alignItems: "center", gap: 7 },
  categoryChipActive: { backgroundColor: t.purpleBright, borderColor: t.purpleBright },
  categoryText: { color: t.ink, fontSize: 12, fontWeight: "700" },
  categoryTextActive: { color: t.white },
  offersHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8, borderBottomWidth: 1, borderBottomColor: t.line, paddingBottom: 12, marginBottom: 14 },
  offersTitle: { color: t.ink, fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  offersCount: { color: t.muted, fontWeight: "600" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingBottom: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 9 },
  liveText: { color: t.muted, fontSize: 10, fontWeight: "600" },
  productRow: { gap: 11, alignItems: "stretch" },
  productColumn: { flex: 1, maxWidth: "50%", marginBottom: 12 },
  productCard: { backgroundColor: t.white, borderRadius: 17, overflow: "hidden", borderWidth: 1, borderColor: "#EFEAF4" },
  productImage: { height: 132, backgroundColor: "#F1EEF8", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imagePlaceholder: { alignItems: "center", gap: 6 },
  imagePlaceholderText: { color: "#AAA2B9", fontSize: 10, fontWeight: "600" },
  favoriteButton: { position: "absolute", top: 9, right: 9, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,.94)", alignItems: "center", justifyContent: "center" },
  productInfo: { padding: 10 },
  availableBadge: { alignSelf: "flex-start", backgroundColor: "#F0EEF5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, flexDirection: "row", alignItems: "center", gap: 5 },
  availableDot: { width: 5, height: 5, borderRadius: 4, backgroundColor: t.green },
  availableText: { color: t.ink, fontSize: 9, fontWeight: "700" },
  price: { color: t.purple, fontSize: 18, fontWeight: "900", marginTop: 8, letterSpacing: -0.4 },
  delivery: { color: t.green, fontSize: 10, fontWeight: "800", lineHeight: 14, marginTop: 4, minHeight: 28 },
  productName: { color: t.ink, fontSize: 13, lineHeight: 17, fontWeight: "800", marginTop: 7, minHeight: 34 },
  storeName: { color: t.muted, fontSize: 10, marginTop: 4 },
  addButton: { minHeight: 36, backgroundColor: t.purpleBright, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10 },
  addButtonText: { color: t.white, fontSize: 11, fontWeight: "800" },
  stateBox: { alignItems: "center", justifyContent: "center", paddingHorizontal: 22, paddingVertical: 35, gap: 10 },
  stateTitle: { color: t.ink, fontWeight: "800", fontSize: 16, textAlign: "center" },
  stateText: { color: t.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  retryButton: { backgroundColor: t.purpleBright, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 5 },
  retryText: { color: t.white, fontWeight: "800", fontSize: 13 },
  tabBar: { flexDirection: "row", backgroundColor: t.white, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8, paddingBottom: 5, paddingHorizontal: 8 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 49 },
  tabIconWrap: { width: 48, height: 28, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  tabIconWrapActive: { backgroundColor: t.purpleSoft },
  tabLabel: { color: "#898296", fontSize: 10, fontWeight: "600" },
  tabLabelActive: { color: t.purpleBright, fontWeight: "900" },
  accountScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  accountMark: { width: 76, height: 76, borderRadius: 26, backgroundColor: t.purpleSoft, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  accountTitle: { color: t.ink, fontSize: 23, fontWeight: "900", textAlign: "center" },
  accountCopy: { color: t.muted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },
  accountButton: { backgroundColor: t.purpleBright, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 99, marginTop: 22 },
  accountButtonText: { color: t.white, fontSize: 14, fontWeight: "800" },
  accountNote: { color: t.muted, fontSize: 11, textAlign: "center", marginTop: 14, lineHeight: 16 },
});
