import { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Search, Plus } from 'lucide-react-native';
import { PropertyCard } from '../components/PropertyCard';
import { LogementFormModal } from '../components/LogementFormModal';
import { useLogements } from '../hooks/useDatabase';
import { getLocataireByLogement } from '../services/locataireService';
import type { Logement } from '../types';

export function PropertiesScreen() {
  const [filter, setFilter] = useState<'tous' | 'libre' | 'occupe'>('tous');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editLogement, setEditLogement] = useState<(Logement & { id: number }) | null>(null);
  const [locatairesMap, setLocatairesMap] = useState<Record<number, string>>({});

  const { logements, refresh } = useLogements();

  useEffect(() => {
    const load = async () => {
      const map: Record<number, string> = {};
      for (const l of logements) {
        if (l.statut === 'occupe' && l.id) {
          const loc = await getLocataireByLogement(l.id);
          if (loc) map[l.id] = loc.nom_complet;
        }
      }
      setLocatairesMap(map);
    };
    load();
  }, [logements]);

  const filteredProperties = useMemo(() => {
    return logements.filter((p) => {
      const matchFilter =
        filter === 'tous' ||
        (filter === 'occupe' && p.statut === 'occupe') ||
        (filter === 'libre' && p.statut === 'libre');
      const matchSearch =
        !search.trim() ||
        p.numero.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [logements, filter, search]);

  const occupiedCount = logements.filter((p) => p.statut === 'occupe').length;
  const freeCount = logements.filter((p) => p.statut === 'libre').length;

  const handleSuccess = () => {
    refresh();
    setShowModal(false);
    setEditLogement(null);
  };

  return (
    <View className="flex-1 bg-gray-50 relative">
      <View className="px-5 pt-4 pb-4">
        <Text className="text-2xl font-bold text-gray-900 mb-4">Logements</Text>

        <View className="relative mb-4 flex-row items-center bg-white rounded-xl px-3 shadow-sm">
          <Search size={20} color="#9CA3AF" />
          <TextInput
            placeholder="Rechercher un logement..."
            value={search}
            onChangeText={setSearch}
            className="flex-1 py-3 pl-2 text-sm text-gray-900"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity
            onPress={() => setFilter('tous')}
            className={`px-4 py-1.5 rounded-full mr-2 ${filter === 'tous' ? 'bg-primary' : 'bg-white border border-gray-200'}`}
          >
            <Text className={`text-sm font-medium ${filter === 'tous' ? 'text-white' : 'text-gray-600'}`}>
              Tous
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('occupe')}
            className={`px-4 py-1.5 rounded-full mr-2 ${filter === 'occupe' ? 'bg-primary' : 'bg-white border border-gray-200'}`}
          >
            <Text className={`text-sm font-medium ${filter === 'occupe' ? 'text-white' : 'text-gray-600'}`}>
              Occupés ({occupiedCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('libre')}
            className={`px-4 py-1.5 rounded-full ${filter === 'libre' ? 'bg-green-600' : 'bg-white border border-gray-200'}`}
          >
            <Text className={`text-sm font-medium ${filter === 'libre' ? 'text-white' : 'text-gray-600'}`}>
              Libres ({freeCount})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="flex-row flex-wrap justify-between">
          {filteredProperties.map((property, index) => (
            <TouchableOpacity
              key={property.id}
              onPress={() => {
                setEditLogement(property as any);
                setShowModal(true);
              }}
              activeOpacity={0.9}
              className="w-[48%] mb-4"
            >
              <PropertyCard
                name={property.numero}
                address={property.type === 'chambre_salon' ? 'Chambre + Salon' : 'Entrée couchée'}
                rentAmount={property.loyer_mensuel}
                status={property.statut === 'occupe' ? 'Occupé' : 'Libre'}
                tenantName={locatairesMap[property.id!]}
                delay={index * 0.05}
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={() => {
          setEditLogement(null);
          setShowModal(true);
        }}
        className="absolute bottom-24 right-5 w-14 h-14 bg-primary rounded-full shadow-lg shadow-blue-500/40 items-center justify-center z-20"
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>

      <LogementFormModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditLogement(null);
        }}
        onSuccess={handleSuccess}
        editLogement={editLogement}
      />
    </View>
  );
}
