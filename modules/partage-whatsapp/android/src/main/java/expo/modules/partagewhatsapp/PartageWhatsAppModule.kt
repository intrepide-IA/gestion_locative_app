package expo.modules.partagewhatsapp

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Envoie un fichier (PDF) directement dans la discussion WhatsApp d'un numéro, même absent des contacts :
 * ACTION_SEND ciblé sur WhatsApp (ou WhatsApp Business) avec l'extra « jid » (numéro@s.whatsapp.net).
 * Renvoie false si aucune version de WhatsApp n'est installée (l'application utilise alors le partage habituel).
 */
private val PAQUETS = listOf("com.whatsapp.w4b", "com.whatsapp")

class PartageWhatsAppModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PartageWhatsApp")

    // `prefere` : « com.whatsapp.w4b » (WhatsApp Business) ou « com.whatsapp » ; sinon le premier installé.
    AsyncFunction("envoyer") { contentUri: String, mimeType: String, numero: String, message: String, prefere: String? ->
      val activite = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val pm = activite.packageManager
      val paquet = (if (prefere != null && estInstalle(pm, prefere)) prefere else null)
        ?: PAQUETS.firstOrNull { estInstalle(pm, it) }
        ?: return@AsyncFunction false
      val uri = Uri.parse(contentUri)
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        setPackage(paquet)
        putExtra(Intent.EXTRA_STREAM, uri)
        if (message.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, message)
        putExtra("jid", "$numero@s.whatsapp.net")
        clipData = ClipData.newRawUri("", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      try {
        activite.startActivity(intent)
        true
      } catch (e: ActivityNotFoundException) {
        false
      }
    }

    /** Versions de WhatsApp installées (Business d'abord). */
    Function("applications") {
      val pm = appContext.reactContext?.packageManager ?: return@Function emptyList<String>()
      PAQUETS.filter { estInstalle(pm, it) }
    }
  }

  private fun estInstalle(pm: PackageManager, paquet: String): Boolean =
    try {
      pm.getPackageInfo(paquet, 0)
      true
    } catch (e: PackageManager.NameNotFoundException) {
      false
    }
}
