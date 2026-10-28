import { registerRootComponent } from 'expo';

// La tâche de fond (vérification des mises à jour) doit être déclarée avant le démarrage de l'application.
import './src/services/alerteMiseAJour';
import App from './src/App';

registerRootComponent(App);
